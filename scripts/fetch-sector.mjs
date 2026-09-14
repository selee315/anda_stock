// ─────────────────────────────────────────────────────────────
//  섹터 수익률 → Supabase  (andaH SIGNALS/섹터 이식)
//  KRX 섹터지수 추종 KODEX 섹터 ETF 기준 섹터별 등락(1일/1주/1개월/3개월). Naver.
//  실행: set -a; source scripts/.env; node scripts/fetch-sector.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL), SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// KODEX 섹터 ETF (Naver로 이름 검증됨)
const SECTORS = [
  ["091160", "반도체"], ["091170", "은행"], ["091180", "자동차"], ["102960", "기계장비"],
  ["102970", "증권"], ["117460", "에너지화학"], ["117680", "철강"], ["117700", "건설"],
  ["140710", "운송"], ["244580", "바이오"], ["266360", "K콘텐츠"], ["305720", "2차전지"],
];

async function closes(symbol) {
  const start = new Date(Date.now() - 130 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const t = await (await fetch(`https://api.finance.naver.com/siseJson.naver?symbol=${symbol}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`, { headers: H, signal: AbortSignal.timeout(12000) })).text();
    return [...t.matchAll(/\["(\d{8})",\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]);
  } catch { return []; }
}
function rets(series) {
  const o = { price: null, d1: null, w1: null, m1: null, m3: null };
  if (series.length < 2) return o;
  const last = series[series.length - 1]; o.price = last[1];
  o.d1 = (last[1] / series[series.length - 2][1] - 1) * 100;
  for (const [k, days] of [["w1", 7], ["m1", 30], ["m3", 91]]) {
    const tgt = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    let base = null; for (const [d, c] of series) { if (d <= tgt) base = c; else break; }
    if (base) o[k] = (last[1] / base - 1) * 100;
  }
  return o;
}

(async () => {
  console.log("💹 섹터 수익률 수집 — KODEX 섹터 ETF 12개");
  const rows = [];
  let base = "";
  for (const [code, sector] of SECTORS) {
    const s = await closes(code); await sleep(80);
    const r = rets(s);
    if (s.length) base = s[s.length - 1][0];
    rows.push({ sector, code, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : Math.round(v * 100) / 100])) });
    console.log(`  ✓ ${sector.padEnd(8)} 1D ${r.d1?.toFixed(1) ?? "-"}% · 1M ${r.m1?.toFixed(1) ?? "-"}%`);
  }
  rows.sort((a, b) => (b.d1 ?? -999) - (a.d1 ?? -999));
  const { error } = await sb.from("sector_returns").insert({ basis: base ? `20${base.slice(2, 4)}-${base.slice(4, 6)}-${base.slice(6, 8)}` : null, data: rows, fetched_at: new Date().toISOString() });
  if (error) { console.error("insert 실패:", error.message); process.exit(1); }
  console.log(`✓ 저장 ${rows.length}섹터`);
  const { data: old } = await sb.from("sector_returns").select("id").order("id", { ascending: false }).range(5, 1000);
  if (old && old.length) await sb.from("sector_returns").delete().in("id", old.map((o) => o.id));
})();
