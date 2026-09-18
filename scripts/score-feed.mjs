// ─────────────────────────────────────────────────────────────
//  market_feed 중요도 스코어러  (맥미니 claude -p, 무료 Max)
//  importance is null 인 행을 배치로 Claude에 넘겨
//  importance(1~5)·category·tickers·ai_summary 를 채운다.
//  실행: set -a; source scripts/.env; node scripts/score-feed.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BATCH = 40;              // 한 번에 채점할 행 수
const MODEL = "haiku";          // 빠르고 저렴 (Max 구독)
const CATEGORIES = ["속보", "실적", "M&A", "공시", "정책", "시황", "종목", "기타"];

const RUBRIC = `너는 한국 주식 리서치의 뉴스 데스크다. 각 항목의 '투자 판단 중요도'를 매겨라.
importance 기준(1~5):
5 = 시장충격/긴급: 유상증자·CB·전환사채, M&A·경영권, 어닝쇼크/어닝서프라이즈, 상장폐지·거래정지, 대량보유·지분변동, 금리·핵심 규제/정책 발표, 급등락 사유
4 = 중요: 실적발표, 목표주가 대폭 조정, 대형 수주·신사업, 업종 규제 이슈
3 = 보통: 일반 기업/산업 뉴스
2 = 낮음: 반복·부수 소식, 단순 시황 코멘트
1 = 잡음: 광고·무관·의미 없는 반복
category 는 다음 중 하나: ${CATEGORIES.join(", ")}.
tickers 는 관련된 한국 상장 종목명 배열(없으면 []). summary 는 한 줄 핵심(40자 내).`;

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", prompt, "--model", MODEL], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("timeout")); }, 180000);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`)); });
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

function extractJson(text) {
  // 응답에서 첫 JSON 배열을 뽑는다 (```json 펜스/설명 섞여도 대응)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cand = fence ? fence[1] : text;
  const s = cand.indexOf("["), e = cand.lastIndexOf("]");
  if (s < 0 || e < 0) throw new Error("JSON 배열 없음");
  return JSON.parse(cand.slice(s, e + 1));
}

(async () => {
  const { data: rows, error } = await sb.from("market_feed")
    .select("id,channel,title,body").is("importance", null)
    .order("id", { ascending: true }).limit(BATCH);
  if (error) { console.error(error.message); process.exit(1); }
  if (!rows || !rows.length) { console.log("채점할 항목 없음"); return; }
  console.log(`🧮 채점 대상 ${rows.length}건`);

  const list = rows.map((r) => ({
    id: r.id, ch: r.channel || "",
    text: `${r.title || ""} ${((r.body || "").slice(0, 200))}`.trim(),
  }));
  const prompt = `${RUBRIC}

아래 JSON 배열의 각 항목을 채점해, 반드시 같은 id를 유지한 JSON 배열로만 답하라.
각 원소: {"id": <숫자>, "importance": 1~5, "category": "<카테고리>", "tickers": [..], "summary": "<한줄>"}
다른 설명 없이 JSON 배열만 출력.

입력:
${JSON.stringify(list, null, 0)}`;

  let parsed;
  try {
    const out = await runClaude(prompt);
    parsed = extractJson(out);
  } catch (e) {
    console.error("Claude/파싱 실패:", e.message);
    process.exit(1);
  }

  const byId = new Map(parsed.map((x) => [Number(x.id), x]));
  const now = new Date().toISOString();
  let ok = 0;
  for (const r of rows) {
    const g = byId.get(Number(r.id));
    const imp = g && Number.isFinite(+g.importance) ? Math.max(1, Math.min(5, Math.round(+g.importance))) : 2;
    const cat = g && CATEGORIES.includes(g.category) ? g.category : "기타";
    const tickers = g && Array.isArray(g.tickers) ? g.tickers.filter((t) => typeof t === "string").slice(0, 8) : null;
    const summary = g && typeof g.summary === "string" ? g.summary.slice(0, 120) : null;
    const { error: ue } = await sb.from("market_feed")
      .update({ importance: imp, category: cat, tickers, ai_summary: summary, scored_at: now })
      .eq("id", r.id);
    if (!ue) ok++;
  }
  console.log(`✓ 채점 완료 ${ok}/${rows.length}건`);
})();
