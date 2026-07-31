// ─────────────────────────────────────────────────────────────
//  AI 리서치 브릿지 — 소은님 PC에서 상시 실행
//  ai_requests(pending) 감지 → 관련 리서치 검색 → `claude -p` 실행(Max 구독)
//  → 답변을 ai_requests 에 저장.  (Anthropic API 키 불필요)
//
//  필요:
//   - Claude Code CLI 설치 + 로그인 (Max 구독):  claude  명령이 동작해야 함
//   - env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node ai-bridge.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const pexec = promisify(execFile);

const URL = (process.env.SUPABASE_URL || "").trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL || !KEY) { console.error("env 누락: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const STOP = new Set(["관련","대해","대한","정리","종합","해줘","알려줘","분석","어때","무엇","최근","리서치"]);
function keywords(q) {
  return [...new Set((q || "").replace(/[^\w가-힣\s]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w)))].slice(0, 6);
}

async function findContext(q) {
  const kw = keywords(q);
  if (!kw.length) return [];
  const or = kw.map((k) => `title.ilike.%${k}%,content.ilike.%${k}%`).join(",");
  const { data } = await sb.from("research_notes")
    .select("title,source_db,meeting_date,url,content")
    .or(or).order("last_edited", { ascending: false }).limit(12);
  return data || [];
}

function buildPrompt(q, ctx) {
  const blocks = ctx.map((r) =>
    `### ${r.title} (${r.source_db || ""}${r.meeting_date ? ", " + r.meeting_date : ""})\n${(r.content || "").slice(0, 2000)}`
  ).join("\n\n---\n\n");
  return `당신은 안다자산운용 리서치팀의 AI 어시스턴트입니다.
아래 [사내 리서치 자료]를 근거로 질문에 한국어로 구체적이고 간결하게 답하세요.
자료에 근거가 없으면 지어내지 말고 "관련 자료가 부족하다"고 답하세요.

[사내 리서치 자료]
${blocks || "(관련 자료 없음)"}

[질문]
${q}`;
}

async function processOne(req) {
  await sb.from("ai_requests").update({ status: "processing" }).eq("id", req.id);
  try {
    const ctx = await findContext(req.question);
    const prompt = buildPrompt(req.question, ctx);
    const { stdout } = await pexec("claude", ["-p", prompt], { maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
    const answer = (stdout || "").trim() || "(응답 없음)";
    await sb.from("ai_requests").update({
      status: "done", answer,
      sources: ctx.map((r) => ({ title: r.title, url: r.url })),
    }).eq("id", req.id);
    console.log(`✓ #${req.id} 완료 (참고자료 ${ctx.length}건)`);
  } catch (e) {
    await sb.from("ai_requests").update({ status: "error", answer: "처리 실패: " + e.message }).eq("id", req.id);
    console.error(`✗ #${req.id} 실패: ${e.message}`);
  }
}

let busy = false;
async function loop() {
  if (busy) return;
  busy = true;
  try {
    const { data } = await sb.from("ai_requests").select("*").eq("status", "pending").order("created_at").limit(1);
    if (data && data.length) await processOne(data[0]);
  } catch (e) { console.error("loop 오류:", e.message); }
  finally { busy = false; }
}

console.log("🤖 AI 브릿지 시작 — 질문 대기 중… (3초 폴링)");
setInterval(loop, 3000);
