// ─────────────────────────────────────────────────────────────
//  컨센서스 (FnGuide) → Supabase 수집기
//  wcomp.fnguide.com/CompanyInfo/Consensus (무료, 키 X)
//  유니버스: disclosures 테이블의 종목코드(활동 종목). 개별 증권사 목표주가 평균 → 컨센서스.
//
//  필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행: set -a; source scripts/.env; node scripts/fetch-consensus.mjs
//  옵션: CNS_LIMIT=20 (테스트용 상한), CNS_CONC=5 (동시성)
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
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const num = (s) => { if (s == null) return null; s = String(s).replace(/,/g, "").trim(); if (s === "" || s === "-") return null; const n = Number(s); return Number.isNaN(n) ? null : n; };
const decodeEnt = (s) => (s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 증권사 목표주가 테이블 행: 증권사 | 일자 | 목표가 | 직전 | 변동 | 투자의견
const BROKER = /<tr[^>]*>\s*<td class="l">([^<]+)<\/td>\s*<td class="c">([^<]*)<\/td>\s*<td class="r">([^<]*)<\/td>\s*<td class="r">([^<]*)<\/td>\s*<td class="r[^"]*">([^<]*)<\/td>\s*<td class="r">([^<]*)<\/td>/g;

async function scrape(code) {
  let html;
  try {
    const r = await fetch(`https://wcomp.fnguide.com/CompanyInfo/Consensus?cmp_cd=${code}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    html = Buffer.from(await r.arrayBuffer()).toString("utf8");
  } catch { return null; }

  // 요청 종목과 응답 종목 일치 확인 (미존재 코드는 기본페이지로 떨어짐)
  const tm = html.match(/<title>([^<(]+)\((\d{6})\)/);
  if (!tm || tm[2] !== code) return null;
  const corp_name = decodeEnt(tm[1].trim());

  const cutoff90 = new Date(Date.now() - 90 * 86400000);
  let sum = 0, cnt = 0, cnt90 = 0, opSum = 0, opCnt = 0, maxDate = "";
  let m;
  BROKER.lastIndex = 0;
  while ((m = BROKER.exec(html))) {
    const name = m[1].trim();
    if (name === "Consensus") continue;                 // 요약행은 제외(직접 평균)
    const p = num(m[3]);
    const op = num(m[6]);
    const dstr = (m[2] || "").trim().replace(/\//g, "-");   // 2026/07/31 → 2026-07-31
    if (p) { sum += p; cnt++; if (dstr && new Date(dstr) >= cutoff90) cnt90++; }
    if (op != null) { opSum += op; opCnt++; }
    if (dstr && dstr > maxDate) maxDate = dstr;
  }
  if (!cnt) return null;                                 // 목표주가 제시 증권사 없음 = 커버리지 없음

  return {
    stock_code: code, corp_name,
    target_price: Math.round(sum / cnt),
    opinion: opCnt ? Math.round((opSum / opCnt) * 100) / 100 : null,
    est_cnt: cnt, est_cnt_90d: cnt90,
    base_date: maxDate || null,
    current_price: null, upside: null,                   // 아래서 Naver로 채움
    updated_at: new Date().toISOString(),
  };
}

// Naver 시총순 전종목 리스트 — 유니버스 + 현재가(closePrice) 동시 확보.
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

// 핵심 대형주 — 공시 유니버스에 없어도 항상 포함(코스피·코스닥 대표주)
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
  // 유니버스: Naver 시총순 전종목(코스피+코스닥) — 현재가 포함
  const listed = [...await marketList("KOSPI", KOSPI_PAGES), ...await marketList("KOSDAQ", KOSDAQ_PAGES)];
  const priceMap = new Map();                       // code → 현재가
  const codes = new Set(CORE);                       // 핵심주는 항상 포함
  for (const s of listed) { codes.add(s.code); if (s.price != null) priceMap.set(s.code, s.price); }
  let universe = [...codes];
  if (LIMIT > 0) universe = universe.slice(0, LIMIT);
  console.log(`🔮 컨센서스 수집 — 유니버스 ${universe.length}개 (코스피↑${KOSPI_PAGES}p·코스닥↑${KOSDAQ_PAGES}p, 동시성 ${CONC})`);

  const rows = [];
  let done = 0, covered = 0;
  for (let i = 0; i < universe.length; i += CONC) {
    const batch = universe.slice(i, i + CONC);
    const res = await Promise.all(batch.map(scrape));
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
  // 상위 커버 종목 미리보기
  rows.sort((a, b) => b.est_cnt - a.est_cnt);
  for (const r of rows.slice(0, 8)) console.log(`   ${r.corp_name.padEnd(12)} 목표 ${String(r.target_price).padStart(9)} · 의견 ${r.opinion} · ${r.est_cnt}곳`);
})();
