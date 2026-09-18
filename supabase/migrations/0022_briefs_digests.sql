-- 리서치 자동화 결과물 적재 (research-tools → Supabase)
-- 브리핑(아침/장마감/리서치콜/오늘의레포트) + 텔레그램 시간별 요약을 클라우드에 백업·열람.
create table if not exists public.briefs (
  id          bigint generated always as identity primary key,
  brief_type  text not null,            -- morning | closing | research_call | daily_reports
  brief_date  date not null,
  title       text,
  body        text,                     -- 마크다운 본문
  notion_url  text,
  created_at  timestamptz not null default now()
);
-- 같은 종류·같은 날짜는 하나(재실행 시 덮어쓰기)
create unique index if not exists briefs_type_date_idx on public.briefs (brief_type, brief_date);
create index if not exists briefs_date_idx on public.briefs (brief_date desc);
alter table public.briefs enable row level security;
drop policy if exists briefs_read on public.briefs;
create policy briefs_read on public.briefs for select using (auth.uid() is not null);

create table if not exists public.tg_digests (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  channels    int,                      -- 요약에 포함된 방 수
  body        text,                     -- 요약 본문
  created_at  timestamptz not null default now()
);
create index if not exists tg_digests_ts_idx on public.tg_digests (ts desc);
alter table public.tg_digests enable row level security;
drop policy if exists tg_digests_read on public.tg_digests;
create policy tg_digests_read on public.tg_digests for select using (auth.uid() is not null);
