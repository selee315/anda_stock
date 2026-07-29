-- ═══════════════════════════════════════════════════════════
--  0002_research_notes — RESEARCH 섹션 데이터 (Notion 연동)
--  로그인 사용자만 조회 / 관리자만 쓰기 (RLS)
-- ═══════════════════════════════════════════════════════════

create table if not exists public.research_notes (
  id           bigint generated always as identity primary key,
  source       text not null default 'notion',   -- notion | manual | ...
  notion_id    text unique,                       -- 원본 Notion 페이지 id (중복 방지)
  title        text not null,
  category     text,                              -- 주간리서치회의 | 데이터 | ...
  summary      text,
  url          text,                              -- Notion 원문 링크
  meeting_date date,
  created_at   timestamptz not null default now()
);
create index if not exists research_notes_date_idx on public.research_notes (meeting_date desc);

alter table public.research_notes enable row level security;

drop policy if exists research_read     on public.research_notes;
drop policy if exists research_admin_ins on public.research_notes;
drop policy if exists research_admin_upd on public.research_notes;
drop policy if exists research_admin_del on public.research_notes;

-- 로그인한 사용자면 조회 가능
create policy research_read     on public.research_notes for select using (auth.uid() is not null);
-- 쓰기는 관리자만
create policy research_admin_ins on public.research_notes for insert with check (public.is_admin());
create policy research_admin_upd on public.research_notes for update using (public.is_admin());
create policy research_admin_del on public.research_notes for delete using (public.is_admin());
