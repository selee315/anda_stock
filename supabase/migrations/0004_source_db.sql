-- ═══════════════════════════════════════════════════════════
--  0004_source_db — 항목 출처(팀 DB) 태그 컬럼
--  회의록 / 기업탐방노트 / 증권사·외부 세미나 / 모닝 브리핑 / Spot Comment / 자료실
--  → 앱에서 종류별 필터에 사용
-- ═══════════════════════════════════════════════════════════

alter table public.research_notes
  add column if not exists source_db text;

create index if not exists research_notes_source_idx on public.research_notes (source_db);
