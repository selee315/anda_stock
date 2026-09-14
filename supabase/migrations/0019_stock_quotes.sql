-- KIS 종목 스냅샷 (종목 통합 뷰 보강)
create table if not exists public.stock_quotes (
  stock_code text primary key, name text,
  price numeric, change numeric, change_p numeric,
  sector text, per numeric, pbr numeric, eps numeric, bps numeric,
  market_cap numeric, high_52w numeric, low_52w numeric, foreign_ratio numeric,
  updated_at timestamptz not null default now());
alter table public.stock_quotes enable row level security;
drop policy if exists stock_quotes_read on public.stock_quotes;
create policy stock_quotes_read on public.stock_quotes for select using (auth.uid() is not null);
