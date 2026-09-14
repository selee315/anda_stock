// ─────────────────────────────────────────────────────────────
//  KIS(한국투자증권) 종목 스냅샷 → Supabase  (종목 통합 뷰 보강용)
//  컨센서스 유니버스 종목의 현재가·업종·PER·PBR·시총·52주·외국인비율 등을 수집.
//  토큰은 파일 캐시(24h). 맥미니 launchd에서 장중 주기 실행.
//  필요: 루트 .env(KIS_APP_KEY/SECRET/ENV) · scripts/.env(SUPABASE_*)
//  실행: node scripts/fetch-kis.mjs           (전체 유니버스)
//        KIS_LIMIT=5 node scripts/fetch-kis.mjs (테스트)
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "..");
function readEnv(p) { const o = {}; try { for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); } } catch {} return o; }
const rootEnv = readEnv(path.join(ROOT, ".env"));
const scEnv = readEnv(path.join(HERE, ".env"));
const APP = process.env.KIS_APP_KEY || rootEnv.KIS_APP_KEY;
const SEC = process.env.KIS_APP_SECRET || rootEnv.KIS_APP_SECRET;
const ENV = (process.env.KIS_ENV || rootEnv.KIS_ENV || "prod").toLowerCase();
const REAL = ENV === "prod" || ENV === "real";
const BASE = REAL ? "https://openapi.koreainvestment.com:9443" : "https://openapivts.koreainvestment.com:29443";
const SUPABASE_URL = (process.env.SUPABASE_URL || scEnv.SUPABASE_URL || "").replace(/\s/g, "");
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || scEnv.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\s/g, "");
if (!APP || !SEC) { console.error("KIS 키 없음 (루트 .env)"); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("SUPABASE 키 없음 (scripts/.env)"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const LIMIT = parseInt(process.env.KIS_LIMIT || "0", 10);
const TOKEN_CACHE = path.join(HERE, ".kis_token.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => { if (s == null || s === "") return null; const n = Number(String(s).replace(/,/g, "")); return Number.isNaN(n) ? null : n; };

async function getToken() {
  try { const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf8")); if (c.token && c.expires > Date.now() + 60000) return c.token; } catch {}
  const r = await fetch(BASE + "/oauth2/tokenP", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", appkey: APP, appsecret: SEC }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("토큰 발급 실패: " + JSON.stringify(j).slice(0, 150));
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify({ token: j.access_token, expires: Date.now() + (Number(j.expires_in || 86400) - 600) * 1000 }));
  return j.access_token;
}

async function quote(code, token) {
  const r = await fetch(BASE + `/uapi/domestic-stock/v1/quotations/inquire-price?fid_cond_mrkt_div_code=J&fid_input_iscd=${code}`,
    { headers: { authorization: "Bearer " + token, appkey: APP, appsecret: SEC, tr_id: "FHKST01010100" } });
  const j = await r.json();
  const o = j.output;
  if (!o || !o.stck_prpr) return null;
  return {
    stock_code: code, name: o.rprs_mrkt_kor_name || null,
    price: num(o.stck_prpr), change: num(o.prdy_vrss), change_p: num(o.prdy_ctrt),
    sector: o.bstp_kor_isnm || null, per: num(o.per), pbr: num(o.pbr),
    eps: num(o.eps), bps: num(o.bps), market_cap: num(o.hts_avls),
    high_52w: num(o.w52_hgpr), low_52w: num(o.w52_lwpr),
    foreign_ratio: num(o.hts_frgn_ehrt), updated_at: new Date().toISOString(),
  };
}

(async () => {
  const token = await getToken();
  // 유니버스: 컨센서스 종목 코드
  const codes = new Set();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("consensus").select("stock_code").range(from, from + 999);
    if (!data || !data.length) break;
    for (const r of data) if (/^\d{6}$/.test(r.stock_code || "")) codes.add(r.stock_code);
    if (data.length < 1000) break;
  }
  let universe = [...codes];
  if (LIMIT > 0) universe = universe.slice(0, LIMIT);
  console.log(`📟 KIS 스냅샷 — ${universe.length}종목 (${REAL ? "실전" : "모의"})`);
  const rows = [];
  for (let i = 0; i < universe.length; i++) {
    try { const q = await quote(universe[i], token); if (q) rows.push(q); } catch (e) { if (i < 3) console.warn("  !", universe[i], e.message); }
    await sleep(70);   // ~14 req/s (실전 20/s 한도 이하)
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${universe.length} (수집 ${rows.length})`);
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("stock_quotes").upsert(rows.slice(i, i + 200), { onConflict: "stock_code" });
    if (error) { console.error("upsert 실패:", error.message); process.exit(1); }
  }
  console.log(`✓ 저장 ${rows.length}종목`);
  for (const r of rows.slice(0, 5)) console.log(`   ${r.name || r.stock_code} ${r.price} (${r.change_p}%) · ${r.sector} · PER ${r.per} PBR ${r.pbr}`);
})();
