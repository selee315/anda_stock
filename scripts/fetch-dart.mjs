// ─────────────────────────────────────────────────────────────
//  DART 공시 → Supabase 수집기
//  opendart.fss.or.kr /api/list.json (무료, 하루 20,000콜)
//  최근 N일치 코스피+코스닥 공시를 긁어 disclosures 에 upsert.
//  웹은 Supabase에서만 읽음.
//
//  필요 env: DART_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행: set -a; source scripts/.env; node scripts/fetch-dart.mjs
//  옵션: DART_DAYS=3 (수집 기간, 기본 2일)
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const KEY          = clean(process.env.DART_API_KEY);
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const DAYS         = Math.max(1, parseInt(process.env.DART_DAYS || "2", 10));
if (!KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 누락: DART_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 공시유형(pblntf_ty) 코드 → 한글
const TY_LABEL = {
  A: "정기공시", B: "주요사항보고", C: "발행공시", D: "지분공시", E: "기타공시",
  F: "외부감사관련", G: "펀드공시", H: "자산유동화", I: "거래소공시", J: "공정위공시",
};
// 법인구분(corp_cls) → 시장
const MARKET = { Y: "KOSPI", K: "KOSDAQ", N: "KONEX", E: "기타" };
// 비고(rm) — 의미있는 것만 표기. 유/코/채/넥/공 = 소관코드(시장뱃지와 중복) → 버림.
const RM_KEEP = { 정: "정정", 철: "철회", 연: "연결정정" };
const mapRm = (rm) => { const s = (rm || "").trim(); if (!s) return null; for (const [k, v] of Object.entries(RM_KEEP)) if (s.includes(k)) return v; return null; };

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const isoDate = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// list.json 응답엔 pblntf_ty가 없어 "유형별 요청"으로 태깅해야 함.
// 각 유형(A~J)으로 기간 공시를 긁고 그 유형으로 태그. corp_cls는 응답 필드에서 얻음(코스피·코스닥만 유지).
const TYPES = ["A", "B", "C", "D", "E", "F", "I", "J"];   // G(펀드)·H(자산유동화) 제외

async function fetchType(ty, bgn, end) {
  const rows = [];
  let page = 1, totalPage = 1;
  do {
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}`
      + `&bgn_de=${bgn}&end_de=${end}&pblntf_ty=${ty}&page_no=${page}&page_count=100`;
    let j;
    try { j = await (await fetch(url)).json(); }
    catch (e) { console.warn(`  ! ${ty} p${page} 요청실패: ${e.message}`); break; }
    if (j.status === "013") break;                       // 조회 데이터 없음
    if (j.status !== "000") { console.warn(`  ! DART ${ty} ${j.status}: ${j.message}`); break; }
    for (const it of j.list || []) {
      if (!it.rcept_no) continue;
      if (it.corp_cls !== "Y" && it.corp_cls !== "K") continue;   // 코스피·코스닥만
      rows.push({
        rcept_no: it.rcept_no,
        corp_code: it.corp_code || null,
        corp_name: it.corp_name || "",
        stock_code: (it.stock_code || "").trim() || null,
        market: MARKET[it.corp_cls] || it.corp_cls || null,
        report_nm: (it.report_nm || "").trim(),
        pblntf_ty: ty,
        pblntf_ty_label: TY_LABEL[ty] || null,
        flr_nm: it.flr_nm || null,
        rcept_dt: isoDate(it.rcept_dt),
        rm: mapRm(it.rm),
        url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${it.rcept_no}`,
      });
    }
    totalPage = parseInt(j.total_page || "1", 10);
    page++;
    await sleep(120);                                    // 예의상 간격
  } while (page <= totalPage && page <= 40);             // 안전 상한
  return rows;
}

(async () => {
  const end = new Date();
  const bgn = new Date(end.getTime() - (DAYS - 1) * 86400000);
  const bgnS = ymd(bgn), endS = ymd(end);
  console.log(`📑 DART 공시 수집 — ${bgnS}~${endS} (코스피+코스닥, 유형 ${TYPES.length}종)`);

  const all = [];
  for (const ty of TYPES) {
    const rows = await fetchType(ty, bgnS, endS);
    console.log(`   ${TY_LABEL[ty]}(${ty}): ${rows.length}건`);
    all.push(...rows);
  }
  // rcept_no 중복 제거
  const uniq = [...new Map(all.map((r) => [r.rcept_no, r])).values()];

  // 청크 upsert
  let saved = 0;
  for (let i = 0; i < uniq.length; i += 500) {
    const { error } = await sb.from("disclosures").upsert(uniq.slice(i, i + 500), { onConflict: "rcept_no" });
    if (error) { console.error("upsert 실패:", error.message); process.exit(1); }
    saved += Math.min(500, uniq.length - i);
  }
  console.log(`✓ 저장 ${uniq.length}건 (upsert)`);

  // 유형별 요약
  const byTy = {};
  for (const r of uniq) byTy[r.pblntf_ty_label || "기타"] = (byTy[r.pblntf_ty_label || "기타"] || 0) + 1;
  console.log("   유형별:", Object.entries(byTy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
})();
