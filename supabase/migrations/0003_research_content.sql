-- ═══════════════════════════════════════════════════════════
--  0003_research_content — 전체 본문/동기화 메타 컬럼 추가
--  (Notion 전체 자료를 본문까지 저장·렌더하기 위함)
-- ═══════════════════════════════════════════════════════════

alter table public.research_notes
  add column if not exists content       text,          -- 본문(마크다운/플레인)
  add column if not exists notion_parent text,          -- 상위 DB/페이지 이름
  add column if not exists icon          text,          -- 이모지 아이콘
  add column if not exists last_edited   timestamptz;   -- 노션 최종수정

create index if not exists research_notes_edited_idx on public.research_notes (last_edited desc);
