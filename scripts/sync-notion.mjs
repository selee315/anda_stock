// ─────────────────────────────────────────────────────────────
//  Notion → Supabase 동기화 스크립트
//  GitHub Actions(cron)에서 서버사이드로 실행 (AI 토큰 0).
//  통합(integration)에 공유된 모든 페이지를 읽어 research_notes 에 upsert.
//
//  필요 env: NOTION_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────
import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";

// 모든 공백/개행 제거 — 복사 시 값 중간에 낀 줄바꿈까지 제거 (HTTP 헤더 오류 방지)
// (토큰·키·URL 은 원래 공백을 포함하지 않으므로 안전)
const clean = (v) => (v || "").replace(/\s+/g, "");
const NOTION_TOKEN = clean(process.env.NOTION_TOKEN);
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!NOTION_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 누락: NOTION_TOKEN / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const rich = (arr) => (arr || []).map((t) => t.plain_text).join("");

// 페이지 제목 추출 (title 타입 프로퍼티 탐색)
function pageTitle(page) {
  const props = page.properties || {};
  for (const k of Object.keys(props)) {
    if (props[k]?.type === "title") return rich(props[k].title) || "제목없음";
  }
  return "제목없음";
}
function pageProp(page, name) {
  const p = (page.properties || {})[name];
  if (!p) return null;
  if (p.type === "date") return p.date?.start || null;
  if (p.type === "multi_select") return p.multi_select.map((s) => s.name).join(", ");
  if (p.type === "select") return p.select?.name || null;
  if (p.type === "rich_text") return rich(p.rich_text);
  return null;
}
function iconEmoji(page) {
  return page.icon?.type === "emoji" ? page.icon.emoji : null;
}
// YYMMDD 로 시작하는 제목에서 날짜 유추
function dateFromTitle(title) {
  const m = /^(\d{2})(\d{2})(\d{2})/.exec(title || "");
  if (!m) return null;
  return `20${m[1]}-${m[2]}-${m[3]}`;
}

// 블록 → 간이 마크다운
async function pageMarkdown(pageId) {
  let out = [], cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const b of res.results) out.push(blockToMd(b));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out.filter(Boolean).join("\n\n");
}
function blockToMd(b) {
  const t = b.type;
  const txt = b[t]?.rich_text ? rich(b[t].rich_text) : "";
  switch (t) {
    case "heading_1": return `# ${txt}`;
    case "heading_2": return `## ${txt}`;
    case "heading_3": return `### ${txt}`;
    case "bulleted_list_item": return `- ${txt}`;
    case "numbered_list_item": return `1. ${txt}`;
    case "to_do": return `- [${b.to_do.checked ? "x" : " "}] ${txt}`;
    case "quote": return `> ${txt}`;
    case "callout": return `> ${b.callout.icon?.emoji || "💡"} ${txt}`;
    case "toggle": return `▸ ${txt}`;
    case "code": return "```\n" + txt + "\n```";
    case "divider": return "---";
    case "paragraph": return txt;
    case "child_page": return `### ${b.child_page.title}`;
    default: return txt;
  }
}

// 검색 인덱싱 지연 대비 — 알려진 DB id 안전망 (회의록 등)
const KNOWN_DB_IDS = [
  "38838dfd-53bc-80d3-85f2-ca9d9290e36a", // 회의록
];

// 접근 가능한 모든 페이지 수집: DB 직접쿼리(즉시) + 독립페이지 search
async function collectPages() {
  const byId = new Map();

  // 1) 접근 가능한 데이터베이스 열거 (search) + 안전망 id
  const dbIds = new Set(KNOWN_DB_IDS);
  let c;
  do {
    const res = await notion.search({ filter: { property: "object", value: "database" }, page_size: 100, start_cursor: c });
    for (const d of res.results) dbIds.add(d.id);
    c = res.has_more ? res.next_cursor : undefined;
  } while (c);
  console.log(`데이터베이스: ${dbIds.size}개`);

  // 2) 각 DB 의 모든 행(page) — databases.query 는 색인 지연과 무관하게 즉시 반환
  for (const dbId of dbIds) {
    try {
      let cc;
      do {
        const res = await notion.databases.query({ database_id: dbId, start_cursor: cc, page_size: 100 });
        for (const p of res.results) byId.set(p.id, p);
        cc = res.has_more ? res.next_cursor : undefined;
      } while (cc);
    } catch (e) {
      console.error(`DB 조회 실패 [${dbId}]: ${e.message}`);
    }
  }

  // 3) 독립 페이지 (DB에 속하지 않은 것) — search
  c = undefined;
  do {
    const res = await notion.search({ filter: { property: "object", value: "page" }, page_size: 100, start_cursor: c });
    for (const p of res.results) byId.set(p.id, p);
    c = res.has_more ? res.next_cursor : undefined;
  } while (c);

  return [...byId.values()];
}

async function run() {
  console.log("Notion 동기화 시작…");
  const pages = await collectPages();
  console.log(`대상 페이지: ${pages.length}건`);

  let ok = 0, fail = 0;
  for (const page of pages) {
    try {
      const title = pageTitle(page);
      const content = await pageMarkdown(page.id);
      const category = pageProp(page, "카테고리") || pageProp(page, "Category") || null;
      const date = pageProp(page, "날짜") || dateFromTitle(title);
      const summary = (content || "").replace(/[#>*`\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
      const row = {
        notion_id: page.id,
        source: "notion",
        title,
        category,
        summary: summary || null,
        content: content || null,
        url: page.url,
        icon: iconEmoji(page),
        meeting_date: date,
        last_edited: page.last_edited_time || null,
      };
      const { error } = await sb.from("research_notes").upsert(row, { onConflict: "notion_id" });
      if (error) throw error;
      ok++;
    } catch (e) {
      fail++;
      console.error(`실패 [${page.id}]:`, e.message);
    }
  }
  console.log(`동기화 완료: 성공 ${ok} / 실패 ${fail}`);
  // 페이지를 찾았는데 하나도 못 썼으면 실패로 종료 (초록불 오해 방지)
  if (pages.length > 0 && ok === 0) {
    console.error("⚠️ 모든 upsert 실패 — 워크플로우를 실패 처리합니다.");
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
