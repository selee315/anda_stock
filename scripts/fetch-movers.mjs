// ─────────────────────────────────────────────────────────────
//  MOVERS (급등락 상위) → Supabase  (andaH MOVERS 이식, Naver 모바일 API)
//  상승률·하락률 상위 (코스피·코스닥). 스냅샷 저장(최신만 조회).
//  실행: set -a; source scripts/.env; node scripts/fetch-movers.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL), SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" };
const num = (s) => { const n = Number(String(s).replace(/,/g, "")); return Number.isNaN(n) ? null : n; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function movers(dir, mkt) {
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stocks/${dir}/${mkt}?page=1&pageSize=20`, { headers: H, signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    return (j.stocks || []).map((s) => ({
      code: s.itemCode, name: s.stockName, price: num(s.closePrice),
      change: num(s.compareToPreviousClosePrice), change_p: num(s.fluctuationsRatio),
    }));
  } catch { return []; }
}

(async () => {
  console.log("🚀 MOVERS 수집 — 상승/하락 × 코스피/코스닥");
  const data = { 상승: {}, 하락: {} };
  for (const [dir, key] of [["up", "상승"], ["down", "하락"]]) {
    for (const mkt of ["KOSPI", "KOSDAQ"]) {
      data[key][mkt] = await movers(dir, mkt); await sleep(120);
      console.log(`  ✓ ${key} ${mkt}: ${data[key][mkt].length}종목`);
    }
  }
  const { error } = await sb.from("movers_snapshot").insert({ data, fetched_at: new Date().toISOString() });
  if (error) { console.error("insert 실패:", error.message); process.exit(1); }
  console.log("✓ 저장");
  const { data: old } = await sb.from("movers_snapshot").select("id").order("id", { ascending: false }).range(5, 1000);
  if (old && old.length) await sb.from("movers_snapshot").delete().in("id", old.map((o) => o.id));
})();
