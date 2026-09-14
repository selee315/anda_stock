-- 급등락 (MOVERS 스냅샷)
create table if not exists public.movers_snapshot (
  id bigint generated always as identity primary key,
  data jsonb not null, fetched_at timestamptz not null default now());
alter table public.movers_snapshot enable row level security;
drop policy if exists movers_read on public.movers_snapshot;
create policy movers_read on public.movers_snapshot for select using (auth.uid() is not null);
