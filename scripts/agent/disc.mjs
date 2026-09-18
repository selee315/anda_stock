// 국내 공시(DART) 검색 — node disc.mjs "회사명 또는 키워드"
import { createClient } from "@supabase/supabase-js";
const sb = createClient((process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(), { auth: { persistSession: false } });

const q = process.argv.slice(2).join(" ").trim();
if (!q) { console.log('사용법: node disc.mjs "한화에어로스페이스" 또는 "유상증자"'); process.exit(0); }
const terms = q.replace(/["'%,()]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
const or = terms.map((t) => `corp_name.ilike.%${t}%,report_nm.ilike.%${t}%`).join(",");
const { data, error } = await sb.from("disclosures")
  .select("rcept_dt,corp_name,stock_code,report_nm,pblntf_ty_label,flr_nm,url")
  .or(or).order("rcept_dt", { ascending: false }).limit(25);
if (error) { console.error("오류:", error.message); process.exit(1); }
for (const r of data || []) {
  const d = (r.rcept_dt || "").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  console.log(`[${d}] ${r.corp_name || ""}(${r.stock_code || "-"}) · ${r.report_nm || ""} · ${r.pblntf_ty_label || ""}${r.flr_nm ? " · 제출:" + r.flr_nm : ""}`);
  if (r.url) console.log(`    ${r.url}`);
}
console.log(`\n(${(data || []).length}건 — 국내 공시)`);
