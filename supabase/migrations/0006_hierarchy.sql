-- ═══════════════════════════════════════════════════════════
--  0006_hierarchy — 기업 > 노트 계층 + 섹터
--  기업탐방노트: 회사 페이지(parent_id NULL, sector 有) > 개별 노트(parent_id=회사)
-- ═══════════════════════════════════════════════════════════

alter table public.research_notes
  add column if not exists parent_id    text,   -- 상위(회사) notion_id
  add column if not exists parent_title text,   -- 상위(회사) 이름
  add column if not exists sector       text;   -- 섹터 (회사 페이지 속성)

create index if not exists research_notes_parent_idx on public.research_notes (parent_id);
create index if not exists research_notes_sector_idx on public.research_notes (sector);
