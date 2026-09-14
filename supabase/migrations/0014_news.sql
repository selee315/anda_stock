-- 뉴스 (RSS 수집)
create table if not exists public.news (
  url          text primary key,
  source       text,            -- 국내 | 해외
  title        text not null,
  published_at timestamptz,
  summary      text,
  fetched_at   timestamptz not null default now()
);
create index if not exists idx_news_pub on public.news (published_at desc);
alter table public.news enable row level security;
drop policy if exists news_read on public.news;
create policy news_read on public.news for select using (auth.uid() is not null);
