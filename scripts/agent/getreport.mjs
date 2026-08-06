// 리포트 전문 읽기 — node getreport.mjs <rpt_id>
import { createClient } from "@supabase/supabase-js";
const sb = createClient((process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(), { auth: { persistSession: false } });

const id = (process.argv[2] || "").trim();
if (!id) { console.log("사용법: node getreport.mjs <rpt_id>"); process.exit(0); }

const { data, error } = await sb.from("reports").select("*").eq("rpt_id", id).single();
if (error) { console.error("오류:", error.message); process.exit(1); }

const tp = data.target_price ? `${Number(data.target_price).toLocaleString("ko-KR")}원${data.tp_dir && data.tp_dir !== "유지" ? "(" + data.tp_dir + ")" : ""}` : "-";
console.log(`# ${data.stock_name || ""}(${data.stock_code || "-"}) — ${data.title || ""}`);
console.log(`증권사: ${data.house || "-"} ${data.analyst || ""} · 의견: ${data.opinion || "-"} · 목표주가: ${tp}`
  + (data.current_price ? ` · 현재가: ${Number(data.current_price).toLocaleString("ko-KR")} (상승여력 ${data.upside > 0 ? "+" : ""}${data.upside}%)` : "")
  + ` · 작성일: ${data.report_date || "-"}`);
console.log(`원문: ${data.url || "-"}\n`);
if ((data.body || "").trim()) {
  console.log(data.body);
} else {
  console.log("(본문 미수집 — 위 요약/제목과 원문 링크 참고. 아직 본문 추출 전이거나 IR 자료일 수 있음)");
  if (data.summary) console.log("\n요약: " + data.summary);
}
