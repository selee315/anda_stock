// ─────────────────────────────────────────────────────────────
//  MACRO (FRED) → Supabase  (andaH MONT 이식, 키리스 CSV)
//  각 시리즈를 fredgraph.csv로 받아 월별 리샘플 + (pc1이면)YoY 변환 후 macro_series 업서트.
//  필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행: set -a; source scripts/.env; node scripts/fetch-macro.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// andaH mont_config 이식 — section별 차트
const SERIES = [
  // headline
  { section: "headline", chart_id: "m2",    title: "M2 통화량",          series: "M2SL",     units: null,  fmt: "big",   ord: 10 },
  { section: "headline", chart_id: "m2v",   title: "M2 유통속도",         series: "M2V",      units: null,  fmt: "level", ord: 11 },
  { section: "headline", chart_id: "cpi",   title: "CPI (YoY)",          series: "CPIAUCSL", units: "pc1", fmt: "pct",   ord: 12 },
  { section: "headline", chart_id: "unemp", title: "실업률",             series: "UNRATE",   units: null,  fmt: "pct",   ord: 13 },
  { section: "headline", chart_id: "ffr",   title: "연방기금금리",        series: "DFF",      units: null,  fmt: "rate",  ord: 14 },
  { section: "headline", chart_id: "ten_y", title: "미국 10년물 금리",    series: "DGS10",    units: null,  fmt: "rate",  ord: 15 },
  // liquidity
  { section: "liquidity", chart_id: "fed_bs", title: "Fed 대차대조표",    series: "WALCL",    units: null,  fmt: "big",   ord: 20 },
  // inflation
  { section: "inflation", chart_id: "cpi_c",  title: "근원 CPI (YoY)",    series: "CPILFESL", units: "pc1", fmt: "pct",   ord: 30 },
  { section: "inflation", chart_id: "pce_c",  title: "근원 PCE (YoY)",    series: "PCEPILFE", units: "pc1", fmt: "pct",   ord: 31 },
  // yield
  { section: "yield",   chart_id: "y30",     title: "미국 30년물 금리",   series: "DGS30",    units: null,  fmt: "rate",  ord: 40 },
  { section: "yield",   chart_id: "y2",      title: "미국 2년물 금리",    series: "DGS2",     units: null,  fmt: "rate",  ord: 41 },
  { section: "yield",   chart_id: "t10y2y",  title: "장단기 스프레드(10Y-2Y)", series: "T10Y2Y", units: null, fmt: "rate", ord: 42 },
  // housing
  { section: "housing", chart_id: "cs",      title: "케이스실러 주택가격", series: "CSUSHPISA", units: null, fmt: "level", ord: 50 },
];

async function fredCsv(id) {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  if (!r.ok) throw new Error(`FRED ${r.status}`);
  const text = await r.text();
  const rows = [];
  for (const line of text.trim().split("\n").slice(1)) {
    const [t, v] = line.split(",");
    if (!t || v === "." || v === "" || v == null) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) rows.push({ t: t.trim(), v: n });
  }
  return rows;
}

// 월별 리샘플: 각 YYYY-MM의 마지막 관측값
function toMonthly(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.t.slice(0, 7), r.v);   // asc라 뒤가 덮음 = 월말값
  return [...m.entries()].map(([ym, v]) => ({ t: ym + "-01", v })).sort((a, b) => a.t.localeCompare(b.t));
}

// pc1 = YoY %: 각 월을 12개월 전 대비
function toYoY(monthly) {
  const out = [];
  for (let i = 12; i < monthly.length; i++) {
    const cur = monthly[i], prev = monthly[i - 12];
    if (prev.v) out.push({ t: cur.t, v: Math.round((cur.v / prev.v - 1) * 1000) / 10 });
  }
  return out;
}

(async () => {
  console.log(`📐 MACRO(FRED) 수집 — ${SERIES.length}개 시리즈`);
  const rows = [];
  for (const s of SERIES) {
    try {
      const raw = await fredCsv(s.series);
      let monthly = toMonthly(raw);
      if (s.units === "pc1") monthly = toYoY(monthly);
      if (!monthly.length) { console.warn(`  ! ${s.series} 데이터 없음`); continue; }
      const pts = monthly.slice(-60);                    // 최근 60개월
      const latest = monthly[monthly.length - 1];
      const prev = monthly[monthly.length - 2] || null;
      rows.push({
        series_id: s.series, section: s.section, chart_id: s.chart_id, title: s.title,
        fmt: s.fmt, units: s.units, ord: s.ord,
        latest_value: Math.round(latest.v * 1000) / 1000, latest_date: latest.t,
        prev_value: prev ? Math.round(prev.v * 1000) / 1000 : null,
        change: prev ? Math.round((latest.v - prev.v) * 1000) / 1000 : null,
        points: pts, updated_at: new Date().toISOString(),
      });
      console.log(`  ✓ ${s.title.padEnd(18)} ${latest.v}  (${latest.t})`);
    } catch (e) { console.warn(`  ! ${s.series}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 150));
  }
  const { error } = await sb.from("macro_series").upsert(rows, { onConflict: "series_id" });
  if (error) { console.error("upsert 실패:", error.message); process.exit(1); }
  console.log(`✓ 저장 ${rows.length}건`);
})();
