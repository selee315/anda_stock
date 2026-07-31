// 노트 전문 읽기 도구 — node get.mjs <id 또는 notion_id>
import { createClient } from "@supabase/supabase-js";
const sb = createClient((process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(), { auth: { persistSession: false } });

const id = (process.argv[2] || "").trim();
if (!id) { console.log("사용법: node get.mjs <id>"); process.exit(0); }
const col = /^\d+$/.test(id) ? "id" : "notion_id";
const { data, error } = await sb.from("research_notes")
  .select("title,source_db,meeting_date,url,content").eq(col, id).limit(1);
if (error) { console.error("오류:", error.message); process.exit(1); }
if (!data || !data.length) { console.log("해당 노트 없음"); process.exit(0); }
const r = data[0];
console.log(`# ${r.title}`);
console.log(`출처: ${r.source_db || ""} | 날짜: ${r.meeting_date || ""} | ${r.url || ""}`);
console.log("");
console.log(r.content || "(본문 없음)");
