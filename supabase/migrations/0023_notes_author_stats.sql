-- research_notes: 작성자/작성일/테마 컬럼 추가 (사내 리서치 통계·정상화용)
-- 2026-10-12. 노션 기업탐방노트 속성(작성자 people · 작성일 date · Theme)을 담는다.
-- Supabase SQL Editor 에서 1회 실행. (DDL 은 분류기가 막아 수동 실행 필요)

alter table public.research_notes
  add column if not exists author       text,   -- 작성자(노션 people → 이름, 복수면 콤마)
  add column if not exists author_ids   text,   -- 작성자 notion user id(들), 콤마구분
  add column if not exists write_date   date,   -- 노션 '작성일' 속성(제목 날짜와 별개)
  add column if not exists theme        text;   -- 노션 'Theme' 속성

-- 통계/조회 가속 인덱스
create index if not exists idx_rn_author     on public.research_notes (author);
create index if not exists idx_rn_write_date on public.research_notes (write_date);
create index if not exists idx_rn_sector     on public.research_notes (sector);
create index if not exists idx_rn_source_db  on public.research_notes (source_db);
