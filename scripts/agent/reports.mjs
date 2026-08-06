// 증권사 리포트 검색 — node reports.mjs "검색어"
// FnGuide 수집 리포트(종목·증권사·의견·목표주가·본문)를 검색해 상위 20건 출력.
import { createClient } from "@supabase/supabase-js";
const sb = createClient((process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(), { auth: { persistSession: false } });

const q = process.argv.slice(2).join(" ").trim();
if (!q) { console.log('사용법: node reports.mjs "카카오 목표주가"'); process.exit(0); }
const terms = q.replace(/["'%,()]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
if (!terms.length) { console.log("검색어가 너무 짧습니다."); process.exit(0); }

const or = terms.map((t) => `stock_name.ilike.%${t}%,title.ilike.%${t}%,house.ilike.%${t}%,body.ilike.%${t}%`).join(",");
const { data, error } = await sb.from("reports")
  .select("rpt_id,report_date,stock_name,stock_code,house,analyst,opinion,target_price,tp_dir,current_price,upside,title,body")
  .or(or).order("report_date", { ascending: false, nullsFirst: false }).order("rpt_id", { ascending: false }).limit(20);
if (error) { console.error("오류:", error.message); process.exit(1); }

for (const r of data || []) {
  const tp = r.target_price ? `TP ${Number(r.target_price).toLocaleString("ko-KR")}${r.tp_dir && r.tp_dir !== "유지" ? "(" + r.tp_dir + ")" : ""}` : "";
  const up = r.upside != null ? ` 상승여력 ${r.upside > 0 ? "+" : ""}${r.upside}%` : "";
  const hasBody = (r.body || "").length > 200 ? " [본문有]" : "";
  console.log(`[${r.rpt_id}] ${r.stock_name || ""}(${r.stock_code || "-"}) · ${r.house || ""} ${r.analyst || ""} · ${r.opinion || ""} ${tp}${up} · ${r.report_date || ""}${hasBody}`);
  console.log(`    ${(r.title || "").replace(/\s+/g, " ").slice(0, 140)}`);
}
console.log(`\n(${(data || []).length}건. 본문 전문은 node getreport.mjs <rpt_id>)`);
