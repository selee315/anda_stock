// ─────────────────────────────────────────────────────────────
//  AI 에이전트 브릿지 — 소은님 맥미니에서 상시 실행 (launchd)
//  ai_requests(pending) 감지 → Claude 를 "에이전트"로 실행:
//    스스로 사내 리서치를 검색(search.mjs)·정독(get.mjs)하고
//    필요하면 웹 검색까지 해서 답변 → ai_requests 에 저장.
//  claude = Max 구독 (Anthropic API 키 불필요).
//
//  필요: Claude Code CLI 로그인, env SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const pexec = promisify(execFile);
const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "agent");

const URL = (process.env.SUPABASE_URL || "").trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL || !KEY) { console.error("env 누락: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function processOne(req) {
  await sb.from("ai_requests").update({ status: "processing" }).eq("id", req.id);
  const started = Date.now();
  try {
    const prompt = `아래 질문에 답하기 위해, 반드시 도구를 적극 사용하세요:
- \`node search.mjs "검색어"\` 로 사내 리서치를 여러 각도로 최소 3~5회 검색
- \`node get.mjs <id>\` 로 관련 노트 전문을 정독 (요약만 보고 답하지 말 것)
- 최신 주가·시황·뉴스가 필요하면 WebSearch / WebFetch 사용
그런 뒤 근거(수치·날짜·종목·출처)를 인용해 애널리스트에게 보고하듯 구조적으로 답하세요.

[질문]
${req.question}`;
    const { stdout } = await pexec("claude",
      ["-p", prompt, "--dangerously-skip-permissions"],
      { cwd: AGENT_DIR, maxBuffer: 32 * 1024 * 1024, timeout: 6 * 60 * 1000, env: process.env });
    const answer = (stdout || "").trim() || "(응답 없음)";
    await sb.from("ai_requests").update({ status: "done", answer }).eq("id", req.id);
    console.log(`✓ #${req.id} 완료 (${Math.round((Date.now() - started) / 1000)}초)`);
  } catch (e) {
    const msg = e.killed ? "시간 초과(6분)" : e.message;
    await sb.from("ai_requests").update({ status: "error", answer: "처리 실패: " + msg }).eq("id", req.id);
    console.error(`✗ #${req.id} 실패: ${msg}`);
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

console.log("🤖 AI 에이전트 브릿지 시작 — 질문 대기 중… (3초 폴링)");
setInterval(loop, 3000);
