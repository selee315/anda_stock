// ─────────────────────────────────────────────────────────────
//  배당주 → Supabase  (andaH dividend_api.py 이식, Naver 금융)
//  고배당 ETF 상위 + 배당 체크리스트 통과 종목(배당수익률·성향·ROE). 스냅샷 저장.
//  실행: set -a; source scripts/.env; node scripts/fetch-dividend.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const H = { "User-Agent": UA };

// 배당 체크리스트 통과 종목 (2025 회계연도 확정, 스크리닝 2026-07-21) — dps: 2023→2024→2025(원)
const STOCKS = [
  { code: "086790", name: "하나금융지주", dps: [3400, 3600, 4105], payout: 29.1, roe: 9.2, note: "3년 연속 배당금 증가. 보통주자본비율 13%대로 은행 중 상위" },
  { code: "316140", name: "우리금융지주", dps: [1000, 1200, 1360], payout: 32.2, roe: 8.9, note: "3년 연속 배당금 증가" },
  { code: "105560", name: "KB금융", dps: [3060, 3174, 4367], payout: 28.9, roe: 10.0, note: "자사주 소각 포함 주주환원 최상위" },
  { code: "055550", name: "신한지주", dps: [2100, 2160, 2590], payout: 25.7, roe: 8.7, note: "3년 연속 배당금 증가" },
  { code: "175330", name: "JB금융지주", dps: [855, 995, 1140], payout: 30.9, roe: 12.4, note: "지방 금융지주 중 수익성 최상위" },
  { code: "005830", name: "DB손해보험", dps: [5300, 6800, 7600], payout: 30.1, roe: 17.8, note: "배당금 증가 폭·ROE 모두 우수" },
  { code: "000810", name: "삼성화재", dps: [16000, 19000, 19500], payout: 47.9, roe: 11.0, note: "지급여력비율 업계 최상위" },
  { code: "000270", name: "기아", dps: [5600, 6500, 6800], payout: 35.6, roe: 12.9, note: "부채비율 62%로 재무 우량" },
  { code: "030200", name: "KT", dps: [1960, 2000, 2400], payout: 34.9, roe: 10.2, note: "이익 안정적인 통신 업종" },
  { code: "033780", name: "KT&G", dps: [5200, 5400, 6000], payout: 66.9, roe: 11.8, note: "배당성향 높으나 현금창출 안정적" },
  { code: "081660", name: "미스토홀딩스", dps: [1090, 1200, 1980], payout: 52.9, roe: 11.4, note: "배당금 증가 폭 큼" },
  { code: "005940", name: "NH투자증권", dps: [800, 950, 1300], payout: 45.0, roe: 11.8, note: "3년 연속 배당 증가" },
  { code: "016360", name: "삼성증권", dps: [2200, 3500, 4000], payout: 35.5, roe: 13.1, note: "3년 연속 배당 증가" },
  { code: "071050", name: "한국금융지주", dps: [2650, 3980, 8690], payout: 26.5, roe: 18.7, note: "2025 배당 급증(이익 급증)" },
  { code: "039490", name: "키움증권", dps: [3000, 7500, 11500], payout: 28.4, roe: 18.1, note: "배당 급증, 이익 최고점 여부 확인 필요" },
];
const ETF_FALLBACK = [["161510", "PLUS 고배당주"], ["466940", "TIGER 은행고배당플러스TOP10"], ["279530", "KODEX 고배당주"], ["315960", "RISE 대형고배당10TR"], ["266160", "RISE 고배당"]];

const num = (s) => { const n = Number(String(s).replace(/,/g, "")); return Number.isNaN(n) ? null : n; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function etfPool() {
  try {
    const r = await fetch("https://finance.naver.com/api/sise/etfItemList.nhn", { headers: H, signal: AbortSignal.timeout(12000) });
    const j = JSON.parse(new TextDecoder("euc-kr").decode(Buffer.from(await r.arrayBuffer())));
    const excl = ["미국", "글로벌", "해외", "선진", "대만", "일본", "중국", "차이나", "채권", "혼합"];
    let pool = j.result.etfItemList.filter((i) => i.itemname.includes("고배당") && !excl.some((k) => i.itemname.includes(k)));
    pool.sort((a, b) => (b.marketSum || 0) - (a.marketSum || 0));
    const top = pool.slice(0, 10).map((i) => [i.itemcode, i.itemname]);
    return top.length >= 5 ? top : ETF_FALLBACK;
  } catch { return ETF_FALLBACK; }
}

async function closes(symbol) {
  const start = new Date(Date.now() - 130 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const url = `https://api.finance.naver.com/siseJson.naver?symbol=${symbol}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`;
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    const text = await r.text();
    const rows = [...text.matchAll(/\["(\d{8})",\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]);
    return rows;
  } catch { return []; }
}
function returns(series) {
  const out = { d1: null, w1: null, m1: null, m3: null, price: null };
  if (series.length < 2) return out;
  const last = series[series.length - 1];
  out.price = last[1];
  out.d1 = (last[1] / series[series.length - 2][1] - 1) * 100;
  const today = Date.now();
  const anchors = { w1: 7, m1: 30, m3: 91 };
  for (const [k, days] of Object.entries(anchors)) {
    const tgt = new Date(today - days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    let base = null;
    for (const [d, c] of series) { if (d <= tgt) base = c; else break; }
    if (base) out[k] = (last[1] / base - 1) * 100;
  }
  return out;
}
async function mobileJson(path) { try { const r = await fetch(`https://m.stock.naver.com/api/stock/${path}`, { headers: H, signal: AbortSignal.timeout(12000) }); return await r.json(); } catch { return {}; } }
async function stockMktcap(code) { const j = await mobileJson(`${code}/integration`); for (const t of j.totalInfos || []) if (t.code === "marketValue") return t.value; return "-"; }
async function etfMeta(code) {
  const out = { aum: "-", constituents: [] };
  const k = (await mobileJson(`${code}/integration`)).etfKeyIndicator || {}; out.aum = k.marketValue || "-";
  const tops = (await mobileJson(`${code}/etfAnalysis`)).etfTop10MajorConstituentAssets || [];
  for (const t of tops) out.constituents.push({ name: t.itemName || "-", weight: num(String(t.etfWeight || "").replace("%", "")) });
  return out;
}

(async () => {
  console.log("💰 배당주 수집 — Naver");
  const etfList = await etfPool();
  const etfCodes = etfList.map(([c]) => c);
  const stockCodes = STOCKS.map((s) => s.code);

  const seriesMap = {}, capMap = {}, metaMap = {};
  for (const c of [...stockCodes, ...etfCodes]) { seriesMap[c] = await closes(c); await sleep(60); }
  for (const c of stockCodes) { capMap[c] = await stockMktcap(c); await sleep(60); }
  for (const c of etfCodes) { metaMap[c] = await etfMeta(c); await sleep(60); }

  const holdingNames = etfCodes.map((c) => new Set(metaMap[c].constituents.map((x) => x.name)));
  const stocks = STOCKS.map((s) => {
    const ret = returns(seriesMap[s.code] || []);
    const price = ret.price;
    return {
      code: s.code, name: s.name, price, mktcap: capMap[s.code],
      etf_count: holdingNames.filter((names) => names.has(s.name)).length,
      yld: price ? (s.dps[2] / price * 100) : null,
      payout: s.payout, dps: s.dps, roe: s.roe, note: s.note,
    };
  }).sort((a, b) => (b.etf_count - a.etf_count) || ((b.yld || 0) - (a.yld || 0)));

  const etfs = etfList.map(([code, name]) => {
    const ret = returns(seriesMap[code] || []); const m = metaMap[code];
    return { code, name, aum: m.aum, d1: ret.d1, w1: ret.w1, m1: ret.m1, m3: ret.m3, constituents: m.constituents };
  });

  const base = Object.values(seriesMap).filter((s) => s.length).map((s) => s[s.length - 1][0]).sort().pop() || "";
  const payload = { stocks, etfs, base_date: base, screened_at: "2026-07-21" };
  const { error } = await sb.from("dividend_snapshot").insert({ data: payload, fetched_at: new Date().toISOString() });
  if (error) { console.error("insert 실패:", error.message); process.exit(1); }
  console.log(`✓ 저장 — 배당주 ${stocks.length} · ETF ${etfs.length} (기준 ${base})`);
  const { data: old } = await sb.from("dividend_snapshot").select("id").order("id", { ascending: false }).range(5, 1000);
  if (old && old.length) await sb.from("dividend_snapshot").delete().in("id", old.map((o) => o.id));
})();
