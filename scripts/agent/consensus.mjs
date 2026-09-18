// 컨센서스(목표주가·상승여력) — node consensus.mjs "회사명"
import { createClient } from "@supabase/supabase-js";
const sb = createClient((process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(), { auth: { persistSession: false } });

const q = process.argv.slice(2).join(" ").trim();
if (!q) { console.log('사용법: node consensus.mjs "삼성전자"'); process.exit(0); }
const terms = q.replace(/["'%,()]/g, " ").split(/\s+/).filter((t) => t.length >= 1);
const or = terms.map((t) => `corp_name.ilike.%${t}%`).join(",");
const { data, error } = await sb.from("consensus")
  .select("corp_name,stock_code,target_price,opinion,upside,est_cnt,est_cnt_90d,current_price,base_date")
  .or(or).order("est_cnt", { ascending: false, nullsFirst: false }).limit(15);
if (error) { console.error("오류:", error.message); process.exit(1); }
for (const r of data || []) {
  const tp = r.target_price ? Number(r.target_price).toLocaleString("ko-KR") : "-";
  const cp = r.current_price ? Number(r.current_price).toLocaleString("ko-KR") : "-";
  const up = r.upside != null ? `${r.upside > 0 ? "+" : ""}${r.upside}%` : "-";
  const cov = r.est_cnt != null ? `추정 ${r.est_cnt}곳${r.est_cnt_90d != null ? `(90일전 ${r.est_cnt_90d})` : ""}` : "";
  console.log(`${r.corp_name || ""}(${r.stock_code || "-"}) · 목표 ${tp} / 현재 ${cp} · 상승여력 ${up} · 의견 ${r.opinion || "-"} · ${cov} · ${r.base_date || ""}`);
}
console.log(`\n(${(data || []).length}건 — 컨센서스)`);
