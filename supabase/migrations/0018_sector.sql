-- 섹터 수익률 (스냅샷)
create table if not exists public.sector_returns (
  id bigint generated always as identity primary key,
  basis date, data jsonb not null, fetched_at timestamptz not null default now());
alter table public.sector_returns enable row level security;
drop policy if exists sector_read on public.sector_returns;
create policy sector_read on public.sector_returns for select using (auth.uid() is not null);
