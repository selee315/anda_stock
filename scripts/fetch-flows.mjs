// ─────────────────────────────────────────────────────────────
//  수급 (투자자별 순매수/순매도 상위) → Supabase
//  소스: 한국투자증권 OpenAPI  국내기관_외국인 매매종목가집계
//        (구 네이버 sise_deal_rank_iframe 폐지 → KIS 로 교체, 2026-09)
//  · 외국인 · 기관 × 코스피 · 코스닥 × 순매수/순매도 상위 (금액 기준)
//  · 각 종목: 현재가·등락률·순매수 수량(주)·순매수 금액(백만원)
//  실행: set -a; source scripts/.env; node scripts/fetch-flows.mjs
//  필요: 루트 .env(KIS_APP_KEY/SECRET/ENV) · scripts/.env(SUPABASE_*)
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
function readEnv(p) { const o = {}; try { for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); } } catch {} return o; }
const rootEnv = readEnv(path.join(ROOT, ".env"));
const scEnv = readEnv(path.join(HERE, ".env"));

const APP = (process.env.KIS_APP_KEY || rootEnv.KIS_APP_KEY || "").trim();
const SEC = (process.env.KIS_APP_SECRET || rootEnv.KIS_APP_SECRET || "").trim();
const ENV = (process.env.KIS_ENV || rootEnv.KIS_ENV || "prod").toLowerCase();
const REAL = ENV === "prod" || ENV === "real";
const KIS_BASE = REAL ? "https://openapi.koreainvestment.com:9443" : "https://openapivts.koreainvestment.com:29443";
const SUPABASE_URL = (process.env.SUPABASE_URL || scEnv.SUPABASE_URL || "").replace(/\s/g, "");
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || scEnv.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\s/g, "");
if (!APP || !SEC) { console.error("KIS 키 없음 (루트 .env)"); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOP = 20;

// FID_INPUT_ISCD: 0001 코스피 · 1001 코스닥
const MARKETS = [["KOSPI", "0001"], ["KOSDAQ", "1001"]];
// FID_ETC_CLS_CODE: 1 외국인 기준정렬 · 2 기관 기준정렬
const INVESTORS = [["외국인", "1", "frgn"], ["기관", "2", "orgn"]];
// FID_RANK_SORT_CLS_CODE: 0 순매수상위 · 1 순매도상위
const SIDES = [["buy", "0"], ["sell", "1"]];

async function getToken() {
  const r = await fetch(KIS_BASE + "/oauth2/tokenP", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: APP, appsecret: SEC }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("KIS 토큰 실패: " + JSON.stringify(j));
  return j.access_token;
}

async function rank(token, iscd, etc, sort, pfx) {
  const url = KIS_BASE + "/uapi/domestic-stock/v1/quotations/foreign-institution-total"
    + `?FID_COND_MRKT_DIV_CODE=V&FID_COND_SCR_DIV_CODE=16449&FID_INPUT_ISCD=${iscd}`
    + `&FID_DIV_CLS_CODE=1&FID_RANK_SORT_CLS_CODE=${sort}&FID_ETC_CLS_CODE=${etc}`;
  const r = await fetch(url, { headers: { authorization: "Bearer " + token, appkey: APP, appsecret: SEC, tr_id: "FHPTJ04400000", custtype: "P" }, signal: AbortSignal.timeout(12000) });
  const j = await r.json();
  if (j.rt_cd !== "0") { console.error("  ! KIS", j.msg1 || JSON.stringify(j)); return []; }
  const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
  return (j.output || []).slice(0, TOP).map((o) => ({
    code: o.mksc_shrn_iscd,
    name: (o.hts_kor_isnm || "").trim(),
    price: num(o.stck_prpr),        // 현재가(원)
    chg: num(o.prdy_ctrt),          // 등락률(%) — 부호 포함
    qty: num(o[pfx + "_ntby_qty"]), // 순매수 수량(주)
    amt: num(o[pfx + "_ntby_tr_pbmn"]), // 순매수 금액(백만원)
  }));
}

(async () => {
  console.log("💧 수급 수집 (KIS) — 투자자 2 × 시장 2 × 순매수/순매도");
  const token = await getToken();
  const data = {};
  for (const [inv, etc, pfx] of INVESTORS) {
    data[inv] = {};
    for (const [mkt, iscd] of MARKETS) {
      const side = {};
      for (const [s, sort] of SIDES) {
        side[s] = await rank(token, iscd, etc, sort, pfx);
        await sleep(200);
      }
      data[inv][mkt] = side;
      console.log(`  ✓ ${inv} ${mkt}: 순매수 ${side.buy.length} · 순매도 ${side.sell.length}`);
    }
  }
  // 기준일: 최신 거래일(수집 시점 기준). 장중이면 당일, 이후면 당일 종가 집계.
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const basis = kst.toISOString().slice(0, 10);
  const { error } = await sb.from("flows_snapshot").insert({ basis, data, fetched_at: new Date().toISOString() });
  if (error) { console.error("insert 실패:", error.message); process.exit(1); }
  console.log(`✓ 저장 (기준일 ${basis})`);
  // 오래된 스냅샷 정리 (최근 10개만 유지)
  const { data: old } = await sb.from("flows_snapshot").select("id").order("id", { ascending: false }).range(10, 1000);
  if (old && old.length) await sb.from("flows_snapshot").delete().in("id", old.map((o) => o.id));
})();
