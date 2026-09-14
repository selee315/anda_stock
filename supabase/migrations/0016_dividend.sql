-- 배당주 스냅샷
create table if not exists public.dividend_snapshot (
  id         bigint generated always as identity primary key,
  data       jsonb not null,      -- {stocks:[],etfs:[],base_date,screened_at}
  fetched_at timestamptz not null default now()
);
alter table public.dividend_snapshot enable row level security;
drop policy if exists dividend_read on public.dividend_snapshot;
create policy dividend_read on public.dividend_snapshot for select using (auth.uid() is not null);
