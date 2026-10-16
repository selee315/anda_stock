// ─────────────────────────────────────────────────────────────
//  컨센서스 (네이버) → Supabase 수집기   ※ fnguide 크롤 금지 공지(2026-10)로 전환
//  소스: m.stock.naver.com/api/stock/{code}/integration → consensusInfo
//        (priceTargetMean=목표주가 컨센서스, recommMean=투자의견 평균 1~5, createDate=기준일)
//  유니버스: 네이버 시총순 전종목(코스피+코스닥) + 핵심 대형주(CORE). 현재가도 동시 확보.
//
//  필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행: set -a; source scripts/.env; node scripts/fetch-consensus.mjs
//  옵션: CNS_LIMIT=20 (테스트 상한), CNS_CONC=5 (동시성)
//  참고: 추정기관 수(est_cnt)는 네이버 API 미제공 → null. target/opinion/base_date 는 제공.
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const LIMIT = parseInt(process.env.CNS_LIMIT || "0", 10);   // 0 = 전체
const CONC  = Math.max(1, parseInt(process.env.CNS_CONC || "5", 10));
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 누락: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

const num = (s) => { if (s == null) return null; s = String(s).replace(/,/g, "").trim(); if (s === "" || s === "-") return null; const n = Number(s); return Number.isNaN(n) ? null : n; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 종목 1개 컨센서스 — 네이버 integration API 의 consensusInfo.
// 목표주가(priceTargetMean) 없으면 커버리지 없음으로 간주(null 반환).
async function scrape(code, name) {
  let j;
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, { headers: { "User-Agent": UA, Referer: "https://m.stock.naver.com/" } });
    if (!r.ok) return null;
    j = await r.json();
  } catch { return null; }

  const ci = j && j.consensusInfo;
  if (!ci) return null;
  const tp = num(ci.priceTargetMean);
  if (!tp) return null;                                 // 목표주가 컨센서스 없음 = 커버리지 없음
  const base = (ci.createDate || "").trim() || null;    // 2026-10-15

  return {
    stock_code: code,
    corp_name: name || (j.stockName || "").trim() || null,
    target_price: tp,
    opinion: num(ci.recommMean),                        // 투자의견 평균(1~5)
    est_cnt: null,                                       // 네이버 미제공
    est_cnt_90d: null,
    base_date: base,
    current_price: null,                                // 아래서 채움
    upside: null,
    updated_at: new Date().toISOString(),
  };
}

// 네이버 시총순 전종목 리스트 — 유니버스 + 현재가(closePrice) 동시 확보.
async function marketList(mkt, pages) {
  const out = [];   // {code, name, price}
  for (let p = 1; p <= pages; p++) {
    let j;
    try {
      const r = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${mkt}?page=${p}&pageSize=100`, { headers: { "User-Agent": UA } });
      if (!r.ok) break;
      j = await r.json();
    } catch { break; }
    const list = j.stocks || [];
    for (const s of list) {
      const code = s.itemCode;
      if (/^\d{6}$/.test(code || "")) out.push({ code, name: s.stockName, price: num(s.closePrice) });
    }
    if (list.length < 100) break;   // 마지막 페이지
    await sleep(80);
  }
  return out;
}

// 핵심 대형주 — 유니버스에 없어도 항상 포함(코스피·코스닥 대표주)
const CORE = [
  "005930", "000660", "373220", "207940", "005380", "005490", "051910", "006400",
  "035420", "035720", "000270", "068270", "105560", "055550", "086790", "316140",
  "012450", "042660", "329180", "009540", "010140", "011200", "267260", "010130",
  "096770", "051900", "090430", "003670", "247540", "066570", "011070", "009150",
  "352820", "030200", "033780", "015760", "017670", "034730", "018260", "323410",
  "259960", "377300", "036570", "251270", "263750", "293490", "112040", "095340",
];

const KOSPI_PAGES  = parseInt(process.env.CNS_KOSPI_PAGES  || "12", 10);   // 시총순 상위 N×100
const KOSDAQ_PAGES = parseInt(process.env.CNS_KOSDAQ_PAGES || "8",  10);

(async () => {
  // 유니버스: 네이버 시총순 전종목(코스피+코스닥) — 현재가 포함
  const listed = [...await marketList("KOSPI", KOSPI_PAGES), ...await marketList("KOSDAQ", KOSDAQ_PAGES)];
  const priceMap = new Map();                       // code → 현재가
  const nameMap = new Map();                         // code → 종목명
  const codes = new Set(CORE);                       // 핵심주는 항상 포함
  for (const s of listed) { codes.add(s.code); if (s.price != null) priceMap.set(s.code, s.price); if (s.name) nameMap.set(s.code, s.name); }
  let universe = [...codes];
  if (LIMIT > 0) universe = universe.slice(0, LIMIT);
  console.log(`🔮 컨센서스 수집(네이버) — 유니버스 ${universe.length}개 (코스피↑${KOSPI_PAGES}p·코스닥↑${KOSDAQ_PAGES}p, 동시성 ${CONC})`);

  const rows = [];
  let done = 0, covered = 0;
  for (let i = 0; i < universe.length; i += CONC) {
    const batch = universe.slice(i, i + CONC);
    const res = await Promise.all(batch.map((c) => scrape(c, nameMap.get(c))));
    for (const r of res) if (r) {
      const cp = priceMap.get(r.stock_code) ?? null;
      r.current_price = cp;
      r.upside = (cp && r.target_price) ? Math.round((r.target_price / cp - 1) * 1000) / 10 : null;
      rows.push(r); covered++;
    }
    done += batch.length;
    if (done % 100 === 0 || done >= universe.length) console.log(`   ${done}/${universe.length} (커버 ${covered})`);
    await sleep(100);
  }

  // upsert
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("consensus").upsert(rows.slice(i, i + 500), { onConflict: "stock_code" });
    if (error) { console.error("upsert 실패:", error.message); process.exit(1); }
  }
  console.log(`✓ 저장 ${rows.length}건 (커버리지 있는 종목)`);
  // 상위 목표주가 미리보기
  rows.sort((a, b) => (b.target_price || 0) - (a.target_price || 0));
  for (const r of rows.slice(0, 8)) console.log(`   ${String(r.corp_name || "").padEnd(12)} 목표 ${String(r.target_price).padStart(9)} · 의견 ${r.opinion} · ${r.base_date}`);
})();
