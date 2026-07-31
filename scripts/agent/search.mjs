// 사내 리서치 검색 도구 — node search.mjs "검색어 여러개"
// 각 단어를 OR 로 title/content 에서 찾아 상위 20건(제목·출처·날짜·요약) 출력.
import { createClient } from "@supabase/supabase-js";
const sb = createClient((process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(), { auth: { persistSession: false } });

const q = process.argv.slice(2).join(" ").trim();
if (!q) { console.log('사용법: node search.mjs "삼성전자 2Q 실적"'); process.exit(0); }
const terms = q.replace(/["'%,()]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
if (!terms.length) { console.log("검색어가 너무 짧습니다."); process.exit(0); }

const or = terms.map((t) => `title.ilike.%${t}%,content.ilike.%${t}%`).join(",");
const { data, error } = await sb.from("research_notes")
  .select("id,title,source_db,meeting_date,content")
  .or(or).order("meeting_date", { ascending: false, nullsFirst: false }).limit(20);
if (error) { console.error("오류:", error.message); process.exit(1); }

for (const r of data || []) {
  const snip = (r.content || "").replace(/\s+/g, " ").slice(0, 170);
  console.log(`[${r.id}] ${r.title}  ·  ${r.source_db || ""}  ·  ${r.meeting_date || ""}`);
  if (snip) console.log(`    ${snip}`);
}
console.log(`\n(${(data || []).length}건 검색됨. 전문은 node get.mjs <id>)`);
