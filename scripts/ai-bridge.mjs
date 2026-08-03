// ─────────────────────────────────────────────────────────────
//  AI 에이전트 브릿지 — 맥미니 상시 실행 (launchd)
//  ai_requests(pending) → Claude 에이전트(stream-json)로 실행:
//   스스로 사내 리서치 검색(search.mjs)·정독(get.mjs)·웹서치 →
//   진행상황을 실시간으로 progress 에 기록 → 최종 답을 answer 에 저장.
//  claude = Max 구독. env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const AGENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "agent");

const URL = (process.env.SUPABASE_URL || "").trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL || !KEY) { console.error("env 누락"); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// tool_use 이벤트 → 사람이 읽을 진행 문구
function describeTool(c) {
  const inp = c.input || {};
  if (c.name === "Bash") {
    const cmd = inp.command || "";
    let m;
    if ((m = cmd.match(/search\.mjs\s+["']?(.+?)["']?\s*$/))) return `🔍 사내 검색: ${m[1].slice(0, 40)}`;
    if ((m = cmd.match(/get\.mjs\s+(\S+)/))) return `📄 노트 정독: ${m[1]}`;
    return `⚙️ ${cmd.slice(0, 50)}`;
  }
  if (c.name === "WebSearch") return `🌐 웹 검색: ${(inp.query || "").slice(0, 40)}`;
  if (c.name === "WebFetch") return `🌐 웹 읽기: ${(inp.url || "").slice(0, 40)}`;
  if (c.name === "Read") return `📖 읽는 중`;
  return `· ${c.name}`;
}

// 직전 대화(후속 질문 대응) — 같은 사용자의 최근 완료 1건
async function priorContext(req) {
  if (!req.user_id) return "";
  const { data } = await sb.from("ai_requests")
    .select("question,answer,created_at").eq("user_id", req.user_id).eq("status", "done")
    .lt("id", req.id).order("id", { ascending: false }).limit(1);
  if (!data || !data.length) return "";
  const p = data[0];
  return `\n\n[직전 대화 — 이번 질문이 후속이면 참고, 아니면 무시]\n이전 질문: ${p.question}\n이전 답변(요약): ${(p.answer || "").slice(0, 600)}\n`;
}

function runAgent(prompt, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn("claude",
      ["-p", prompt, "--model", "opus", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"],
      { cwd: AGENT_DIR, env: process.env });
    let buf = "", finalText = "", stderr = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("시간 초과(12분)")); }, 12 * 60 * 1000);
    p.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "assistant" && ev.message?.content) {
          for (const c of ev.message.content) if (c.type === "tool_use") onProgress(describeTool(c));
        } else if (ev.type === "result") {
          finalText = ev.result || finalText;
        }
      }
    });
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (finalText.trim()) resolve(finalText.trim());
      else if (code === 0) resolve("(응답 없음)");
      else reject(new Error(stderr.slice(-400) || `종료코드 ${code}`));
    });
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function processOne(req) {
  const progress = [];
  const pushProgress = (line) => {
    progress.push(line);
    sb.from("ai_requests").update({ progress: progress.slice(-14).join("\n") }).eq("id", req.id).then(() => {}, () => {});
  };
  await sb.from("ai_requests").update({ status: "processing", progress: "🚀 시작…" }).eq("id", req.id);
  const started = Date.now();
  try {
    const prior = await priorContext(req);
    const prompt = `아래 질문에 답하기 위해, 반드시 도구를 적극 사용하세요:
- \`node search.mjs "검색어"\` 로 사내 리서치를 여러 각도로 최소 3~5회 검색
- \`node get.mjs <id>\` 로 관련 노트 전문을 정독 (요약만 보고 답하지 말 것)
- 최신 주가·시황·뉴스가 필요하면 WebSearch / WebFetch 사용
그런 뒤 근거(수치·날짜·종목·출처)를 인용해 애널리스트에게 보고하듯 구조적으로 답하세요.${prior}

[질문]
${req.question}`;
    const answer = await runAgent(prompt, pushProgress);
    await sb.from("ai_requests").update({ status: "done", answer }).eq("id", req.id);
    sb.from("ai_requests").update({ progress: null }).eq("id", req.id).then(() => {}, () => {});
    console.log(`✓ #${req.id} 완료 (${Math.round((Date.now() - started) / 1000)}초, 진행 ${progress.length}단계)`);
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

console.log("🤖 AI 에이전트 브릿지 시작 (stream) — 질문 대기 중…");
setInterval(loop, 3000);
