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
const FULL_SYNC    = clean(process.env.FULL_SYNC) === "true";  // 전체 재수집 여부

if (!NOTION_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("환경변수 누락: NOTION_TOKEN / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 신형 데이터소스 API 지원 (구형 databases.query 로는 data-source DB 를 못 읽음)
const NOTION_VERSION = "2025-09-03";
async function notionFetch(path, method = "GET", body) {
  const res = await fetch("https://api.notion.com" + path, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.message || `HTTP ${res.status}`);
  return j;
}
async function dataSourceIdsOf(dbId) {
  const j = await notionFetch(`/v1/databases/${dbId}`);
  return (j.data_sources || []).map((d) => d.id);
}

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
// 유효한 YYYY-MM-DD 문자열만 통과 (아니면 null)
function validDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
// 제목 앞머리에서 날짜 유추: 8자리(YYYYMMDD) 또는 6자리(YYMMDD)
function dateFromTitle(title) {
  const t = (title || "").trim();
  let m = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})/.exec(t);          // 20211125 / 2021-11-25
  if (m) return validDate(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{2})(\d{2})(\d{2})(?!\d)/.exec(t);                   // 260727
  if (m) return validDate(`20${m[1]}-${m[2]}-${m[3]}`);
  return null;
}

// 블록 → 간이 마크다운 (중첩 블록·인라인 DB 재귀 수집)
async function pageMarkdown(pageId, depth = 0) {
  if (depth > 6) return "";  // 안전장치
  let out = [], cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const b of res.results) {
      if (b.type === "child_database") {
        // 인라인 DB(예: 회사 페이지 안의 "노트") → 행들의 본문까지 끌어와 붙임
        out.push(await inlineDbMarkdown(b, depth));
        continue;
      }
      out.push(blockToMd(b));
      // 토글·컬럼·리스트 등 하위 블록이 있으면 재귀 (child_page 제외)
      if (b.has_children && b.type !== "child_page") {
        const sub = await pageMarkdown(b.id, depth + 1);
        if (sub) out.push(sub);
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out.filter(Boolean).join("\n\n");
}

// 인라인 DB 발견 시: (1) 목록 마크다운 반환 (2) 각 행을 pendingRows 에 넣어 개별 싱크되게
const pendingRows = [];   // 페이지 처리 중 발견된 하위 DB 행들 (큐에 추가됨)
async function inlineDbMarkdown(dbBlock) {
  const label = dbBlock.child_database?.title || "하위 DB";
  try {
    const dsIds = await dataSourceIdsOf(dbBlock.id);
    let items = [];
    for (const dsId of dsIds) {
      let cc;
      do {
        const res = await notionFetch(`/v1/data_sources/${dsId}/query`, "POST", cc ? { start_cursor: cc } : {});
        for (const row of res.results) {
          items.push(`- [${pageTitle(row)}](${row.url})`);
          pendingRows.push(row);   // 개별 노트 → 별도 항목으로 본문까지 싱크
        }
        cc = res.has_more ? res.next_cursor : undefined;
      } while (cc);
    }
    return items.length ? `### 📁 ${label}\n${items.join("\n")}` : `### 📁 ${label}`;
  } catch {
    return `### 📁 ${label}`;
  }
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

// 팀 DB 6종만 싱크 (개인 스페이스 유입 차단). 각 항목에 출처(source) 태그.
const TEAM_DBS = [
  { id: "38838dfd-53bc-80d3-85f2-ca9d9290e36a", name: "회의록" },
  { id: "38a38dfd-53bc-80ca-87c4-c051d718466f", name: "기업탐방노트" },
  { id: "38838dfd-53bc-8047-a92e-e5cfd3000e78", name: "증권사/외부 세미나" },
  { id: "d0708e9c-9f78-4f46-a10b-4fb948403ead", name: "모닝 브리핑" },
  { id: "38a38dfd-53bc-807b-a215-e4d21eeb9a64", name: "Spot Comment" },
  { id: "26038dfd-53bc-835b-a5cf-010197970f0e", name: "자료실" },
];

// 팀 DB 들의 행만 수집 (넓은 search 안 함 = 개인자료 제외). 행에 _source 태그.
async function collectPages() {
  const byId = new Map();
  for (const { id: dbId, name } of TEAM_DBS) {
    const before = byId.size;
    try {
      const dsIds = await dataSourceIdsOf(dbId);
      for (const dsId of dsIds) {
        let cc;
        do {
          const res = await notionFetch(`/v1/data_sources/${dsId}/query`, "POST", cc ? { start_cursor: cc } : {});
          for (const p of res.results) { p._source = name; byId.set(p.id, p); }
          cc = res.has_more ? res.next_cursor : undefined;
        } while (cc);
      }
      console.log(`  DB [${name}] → ${byId.size - before}행`);
    } catch (e) {
      console.error(`  DB [${name}] 접근불가: ${e.message}`);
    }
  }
  return [...byId.values()];
}

async function run() {
  console.log("Notion 동기화 시작…");
  const pages = await collectPages();
  console.log(`대상 페이지: ${pages.length}건`);

  // 증분: 기존 last_edited 로드 → 안 바뀐 페이지는 본문 재수집 생략
  const seen = new Map();
  {
    let from = 0;
    for (;;) {
      const { data } = await sb.from("research_notes").select("notion_id,last_edited").range(from, from + 999);
      if (!data || !data.length) break;
      for (const r of data) if (r.last_edited) seen.set(r.notion_id, new Date(r.last_edited).getTime());
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  // 큐 방식: 처리 중 발견한 하위 DB 행(개별 노트)도 큐에 넣어 본문까지 싱크
  const queue = [...pages];
  const processed = new Set();
  const parentMap = new Map();   // childId -> {pid, ptitle} (처리순서 무관하게 끝에 보정)
  let ok = 0, fail = 0, skip = 0, discovered = 0;
  while (queue.length) {
    const page = queue.shift();
    if (!page || processed.has(page.id)) continue;
    processed.add(page.id);
    try {
      const edited = page.last_edited_time ? new Date(page.last_edited_time).getTime() : null;
      // FULL_SYNC 아니면, 안 바뀐 페이지는 본문 재수집 생략 (증분)
      if (!FULL_SYNC && edited && seen.get(page.id) === edited) { skip++; continue; }
      const title = pageTitle(page);
      pendingRows.length = 0;                        // 이 페이지에서 발견될 하위 행 수집 준비
      const content = await pageMarkdown(page.id);
      const found = pendingRows.splice(0);           // 이 페이지 안에서 발견된 하위 노트들
      for (const r of found) {
        parentMap.set(r.id, { pid: page.id, ptitle: title });   // 항상 부모관계 기록
        if (!processed.has(r.id)) {
          r._source = page._source; r._parent_id = page.id; r._parent_title = title;
          queue.push(r); discovered++;
        }
      }
      const category = pageProp(page, "카테고리") || pageProp(page, "Category") || null;
      const date = validDate(pageProp(page, "날짜")) || dateFromTitle(title);
      const summary = (content || "").replace(/[#>*`\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
      const row = {
        notion_id: page.id,
        source: "notion",
        source_db: page._source || null,
        parent_id: page._parent_id || null,
        parent_title: page._parent_title || null,
        sector: pageProp(page, "Sector") || pageProp(page, "섹터") || null,
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
      if (ok % 50 === 0) console.log(`  …진행 ${ok}건 (큐 ${queue.length})`);
    } catch (e) {
      fail++;
      console.error(`실패 [${page.id}]:`, e.message);
    }
  }
  // 고아 노트 부모 보정: 발견된 부모관계로, parent 없던(처리순서 탓) 노트에 부모 채움
  let fixed = 0;
  for (const [cid, pt] of parentMap) {
    const { error } = await sb.from("research_notes")
      .update({ parent_id: pt.pid, parent_title: pt.ptitle })
      .eq("notion_id", cid).is("parent_id", null);
    if (!error) fixed++;
  }
  console.log(`부모 보정 시도: ${parentMap.size}건`);
  console.log(`동기화 완료: 성공 ${ok} / 생략 ${skip} / 실패 ${fail} / 하위발견 ${discovered}`);
  if ((ok + skip) === 0 && processed.size > 0) {
    console.error("⚠️ 모든 upsert 실패 — 워크플로우를 실패 처리합니다.");
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
