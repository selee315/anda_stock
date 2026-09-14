// ─────────────────────────────────────────────────────────────
//  수급 (투자자별 순매수/순매도 상위) → Supabase  (andaH FLOWS 이식)
//  Naver sise_deal_rank_iframe — 기관·외국인 × 코스피·코스닥 × 매수/매도 상위.
//  단위: 수량 천주, 금액 백만원. 최신 거래일 표만 사용.
//  실행: set -a; source scripts/.env; node scripts/fetch-flows.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const INVESTORS = [["외국인", "9000"], ["기관", "1000"]];
const MARKETS = [["KOSPI", "01"], ["KOSDAQ", "02"]];
const ROW_RE = /<a href="\/item\/main\.naver\?code=(\w{6})"[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*>\s*([\-,\d]+)\s*<\/td>\s*<td[^>]*>\s*([\-,\d]+)\s*<\/td>/g;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deal(sosok, gubun, type, mkt) {
  const url = `https://finance.naver.com/sise/sise_deal_rank_iframe.naver?sosok=${sosok}&investor_gubun=${gubun}&type=${type}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://finance.naver.com/" }, signal: AbortSignal.timeout(12000) });
  const html = new TextDecoder("euc-kr").decode(Buffer.from(await r.arrayBuffer()));
  // 이틀치 표(type_1) 중 최신일 표만
  const positions = [...html.matchAll(/<table[^>]*class="type_1"/g)].map((m) => m.index);
  let bestBasis = "", bestSeg = html;
  for (let i = 0; i < positions.length; i++) {
    const cpos = positions[i];
    const before = html.slice(Math.max(0, cpos - 1200), cpos);
    const dates = before.match(/\d{2}\.\d{2}\.\d{2}/g) || [];
    const basis = dates.length ? dates[dates.length - 1] : "";
    const seg = html.slice(cpos, positions[i + 1] || html.length);
    if (basis >= bestBasis) { bestBasis = basis; bestSeg = seg; }
  }
  const rows = [];
  let m; ROW_RE.lastIndex = 0;
  while ((m = ROW_RE.exec(bestSeg)) && rows.length < 15) {
    rows.push({ code: m[1], name: m[2].trim(), mkt, qty_k: Number(m[3].replace(/,/g, "")), amt_mn: Number(m[4].replace(/,/g, "")) });
  }
  return { basis: bestBasis, rows };
}

(async () => {
  console.log("💧 수급 수집 — 투자자 2 × 시장 2 × 매수/매도");
  const data = {};
  let basis = "";
  for (const [inv, gubun] of INVESTORS) {
    data[inv] = {};
    for (const [mkt, sosok] of MARKETS) {
      const buy = await deal(sosok, gubun, "buy", mkt); await sleep(120);
      const sell = await deal(sosok, gubun, "sell", mkt); await sleep(120);
      data[inv][mkt] = { buy: buy.rows, sell: sell.rows };
      if (buy.basis > basis) basis = buy.basis;
      console.log(`  ✓ ${inv} ${mkt}: 매수 ${buy.rows.length} · 매도 ${sell.rows.length} (기준 ${buy.basis})`);
    }
  }
  const trade_date = basis ? "20" + basis.replace(/\./g, "-") : null;
  const { error } = await sb.from("flows_snapshot").insert({ basis: trade_date, data, fetched_at: new Date().toISOString() });
  if (error) { console.error("insert 실패:", error.message); process.exit(1); }
  console.log(`✓ 저장 (기준일 ${trade_date})`);
  // 오래된 스냅샷 정리 (최근 10개만 유지)
  const { data: old } = await sb.from("flows_snapshot").select("id").order("id", { ascending: false }).range(10, 1000);
  if (old && old.length) await sb.from("flows_snapshot").delete().in("id", old.map((o) => o.id));
})();
