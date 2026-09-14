-- 수급 (투자자별 순매수 스냅샷)
create table if not exists public.flows_snapshot (
  id         bigint generated always as identity primary key,
  basis      date,
  data       jsonb not null,      -- {투자자:{시장:{buy:[],sell:[]}}}
  fetched_at timestamptz not null default now()
);
alter table public.flows_snapshot enable row level security;
drop policy if exists flows_read on public.flows_snapshot;
create policy flows_read on public.flows_snapshot for select using (auth.uid() is not null);
