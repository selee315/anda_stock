-- 시황·주요뉴스 통합 피드 (텔레그램 · 더벨 · RSS … 를 한 테이블에)
-- 수집기(맥미니 launchd)는 service_role 로 upsert, 웹은 RLS read.
create table if not exists public.market_feed (
  id           bigint generated always as identity primary key,
  source       text not null,             -- telegram | thebell | rss
  channel      text,                       -- 채널/매체명 (예: '연합인포맥스속보', '더벨')
  external_id  text not null,              -- 원본 고유키 (source 내 중복제거용)
  title        text,
  body         text,
  url          text,
  published_at timestamptz,
  importance   smallint,                   -- 1~5 (null = 미채점). 5=긴급
  category     text,                       -- 속보 | 실적 | M&A | 공시 | 정책 | 시황 | 종목 | 기타
  tickers      text[],                     -- 관련 종목명/코드
  ai_summary   text,                       -- AI 한 줄 요약
  scored_at    timestamptz,                -- 채점 완료 시각
  created_at   timestamptz not null default now()
);

-- source 내 원본키 기준 중복 제거(재수집 안전)
create unique index if not exists market_feed_uniq on public.market_feed (source, external_id);
-- 최신순 조회
create index if not exists market_feed_pub_idx on public.market_feed (published_at desc nulls last);
-- 중요도×최신 조회
create index if not exists market_feed_imp_idx on public.market_feed (importance desc nulls last, published_at desc nulls last);
-- 미채점 행만 빠르게 (스코어러가 폴링)
create index if not exists market_feed_unscored_idx on public.market_feed (id) where importance is null;

alter table public.market_feed enable row level security;
drop policy if exists market_feed_read on public.market_feed;
create policy market_feed_read on public.market_feed for select using (auth.uid() is not null);
