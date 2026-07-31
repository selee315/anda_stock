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

const clean = (t) => t.replace(/^[\s\-*\d.)"']+/, "").replace(/["'%,()]/g, " ").trim();

// Claude 로 질문을 검색어(종목·섹터·용어)로 확장 — 어휘 불일치(방산↔한국항공우주, 2분기↔2Q26) 해소
async function expandTerms(q) {
  const base = keywords(q);
  try {
    const { stdout } = await pexec("claude", ["-p",
      `아래 질문에 답하려고 사내 리서치 DB(한국 주식 리서치)를 검색합니다. 관련 있을 종목명·회사명·섹터·핵심용어를 쉼표로만 나열하세요. 설명·번호 없이 단어만, 최대 14개. 분기 표현은 '2Q','2분기' 둘 다 포함.\n질문: ${q}`],
      { maxBuffer: 1024 * 1024, timeout: 60000 });
    const terms = stdout.split(/[,\n]/).map(clean).filter((s) => s.length >= 2 && s.length <= 24);
    return [...new Set([...base, ...terms])].slice(0, 16);
  } catch { return base; }
}

async function findContext(q) {
  const terms = (await expandTerms(q)).map(clean).filter(Boolean);
  if (!terms.length) return [];
  // 각 검색어로 후보 수집 → 매칭 검색어 수(hits)로 랭킹 → 상위 18건
  const pool = new Map();
  for (const k of terms) {
    const { data } = await sb.from("research_notes")
      .select("id,title,source_db,meeting_date,url,content,last_edited")
      .or(`title.ilike.%${k}%,content.ilike.%${k}%`).limit(30);
    for (const r of data || []) {
      const e = pool.get(r.id) || { row: r, hits: 0 };
      e.hits++; pool.set(r.id, e);
    }
  }
  const ranked = [...pool.values()].sort((a, b) =>
    b.hits - a.hits || new Date(b.row.last_edited || 0) - new Date(a.row.last_edited || 0));
  console.log(`  검색어 ${terms.length}개 → 후보 ${pool.size} → 상위 18`);
  return ranked.slice(0, 18).map((e) => e.row);
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
