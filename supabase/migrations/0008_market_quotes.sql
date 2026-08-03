-- ─────────────────────────────────────────────────────────────
--  시장 데이터 (EODHD) — 지수·환율·크립토·원자재 지연 시세 스냅샷
--  Mac mini fetcher가 service_role로 upsert, 웹은 로그인 사용자만 읽음
-- ─────────────────────────────────────────────────────────────
create table if not exists public.market_quotes (
  symbol      text primary key,      -- EODHD 티커 (예: GSPC.INDX, USDKRW.FOREX)
  name        text not null,         -- 표시명 (예: S&P 500)
  region      text,                  -- 묶음 (미국/한국/아시아/유럽/환율/기타)
  kind        text,                  -- index | fx | crypto | commodity
  price       numeric,               -- 현재가(종가)
  change      numeric,               -- 전일대비
  change_p    numeric,               -- 전일대비 %
  prev_close  numeric,
  quote_ts    bigint,                -- EODHD timestamp (epoch)
  ord         int default 0,         -- 표시 순서
  updated_at  timestamptz not null default now()
);

alter table public.market_quotes enable row level security;

drop policy if exists market_read on public.market_quotes;
create policy market_read on public.market_quotes for select using (auth.uid() is not null);
-- 쓰기는 service_role(fetcher) 전용 → 별도 정책 없음(RLS 우회)
