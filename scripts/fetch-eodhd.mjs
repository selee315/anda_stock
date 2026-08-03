// ─────────────────────────────────────────────────────────────
//  EODHD → Supabase 시장 데이터 fetcher
//  무료 플랜(20호출/일) 대응: 엄선한 심볼을 "한 번"만 배치로 긁어
//  market_quotes 에 upsert. 웹은 Supabase에서만 읽음(조회 무제한).
//
//  필요 env: EODHD_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행: set -a; source scripts/.env; node scripts/fetch-eodhd.mjs
//  ⚠️ 각 티커 = 1 API 호출. 아래 목록 개수만큼 소모됨.
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const KEY          = clean(process.env.EODHD_API_KEY);
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 누락: EODHD_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 심볼 목록 — name/region/kind/ord (표시용). 개수 = 일일 호출 소모량.
const SYMBOLS = [
  // 미국
  { symbol: "GSPC.INDX",  name: "S&P 500",       region: "미국", kind: "index", ord: 10 },
  { symbol: "DJI.INDX",   name: "다우존스",       region: "미국", kind: "index", ord: 11 },
  { symbol: "IXIC.INDX",  name: "나스닥종합",     region: "미국", kind: "index", ord: 12 },
  // 한국
  { symbol: "KS11.INDX",  name: "코스피",         region: "한국", kind: "index", ord: 20 },
  { symbol: "KQ11.INDX",  name: "코스닥",         region: "한국", kind: "index", ord: 21 },
  // 아시아
  { symbol: "N225.INDX",  name: "닛케이225",      region: "아시아", kind: "index", ord: 30 },
  { symbol: "HSI.INDX",   name: "항셍",           region: "아시아", kind: "index", ord: 31 },
  // 유럽
  { symbol: "GDAXI.INDX", name: "독일 DAX",       region: "유럽", kind: "index", ord: 40 },
  // 환율
  { symbol: "USDKRW.FOREX", name: "원/달러",      region: "환율", kind: "fx", ord: 50 },
  { symbol: "USDJPY.FOREX", name: "엔/달러",      region: "환율", kind: "fx", ord: 51 },
  { symbol: "EURUSD.FOREX", name: "유로/달러",    region: "환율", kind: "fx", ord: 52 },
  // 원자재·크립토
  { symbol: "GLD.US",       name: "금(GLD ETF)",  region: "원자재", kind: "commodity", ord: 60 },
  { symbol: "BTC-USD.CC",   name: "비트코인",     region: "원자재", kind: "crypto", ord: 61 },
];

const META = Object.fromEntries(SYMBOLS.map((s) => [s.symbol, s]));

async function fetchBatch(symbols) {
  // real-time/{first}?s={나머지} — 전부 한 요청에 담아 반환(티커당 1호출 카운트)
  const first = symbols[0];
  const rest = symbols.slice(1).join(",");
  const url = `https://eodhd.com/api/real-time/${first}?api_token=${KEY}&fmt=json`
            + (rest ? `&s=${encodeURIComponent(rest)}` : "");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`EODHD ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [j];   // 단일 심볼이면 객체로 옴
}

function toRow(q) {
  const m = META[q.code];
  if (!m) return null;
  const num = (x) => (x === "NA" || x == null || Number.isNaN(Number(x)) ? null : Number(x));
  return {
    symbol: q.code, name: m.name, region: m.region, kind: m.kind, ord: m.ord,
    price: num(q.close), change: num(q.change), change_p: num(q.change_p),
    prev_close: num(q.previousClose), quote_ts: num(q.timestamp),
    updated_at: new Date().toISOString(),
  };
}

(async () => {
  console.log(`📈 EODHD fetch — ${SYMBOLS.length}개 심볼 (호출 ${SYMBOLS.length}회 소모)`);
  const quotes = await fetchBatch(SYMBOLS.map((s) => s.symbol));
  const rows = quotes.map(toRow).filter(Boolean);
  const bad = SYMBOLS.filter((s) => !rows.find((r) => r.symbol === s.symbol)).map((s) => s.symbol);
  if (bad.length) console.warn(`⚠️  응답 없음(무료 미지원 가능): ${bad.join(", ")}`);

  const { error } = await sb.from("market_quotes").upsert(rows, { onConflict: "symbol" });
  if (error) { console.error("upsert 실패:", error.message); process.exit(1); }
  console.log(`✓ 저장 ${rows.length}건`);
  for (const r of rows) {
    const p = r.change_p == null ? "" : ` (${r.change_p > 0 ? "+" : ""}${r.change_p}%)`;
    console.log(`   ${r.name.padEnd(10)} ${String(r.price ?? "-").padStart(12)}${p}`);
  }

  // 남은 호출량 리포트
  try {
    const u = await (await fetch(`https://eodhd.com/api/user?api_token=${KEY}&fmt=json`)).json();
    console.log(`\n오늘 사용: ${u.apiRequests}/${u.dailyRateLimit}`);
  } catch {}
})();
