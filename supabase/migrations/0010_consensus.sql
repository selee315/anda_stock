-- ─────────────────────────────────────────────────────────────
--  컨센서스 (FnGuide) — 증권사 목표주가·투자의견 집계
--  소스: wcomp.fnguide.com/CompanyInfo/Consensus (무료 스크래핑, 키 X)
--  개별 증권사 목표주가를 평균 → 컨센서스. FY 재무추정치는 v2.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.consensus (
  stock_code    text primary key,      -- 6자리 종목코드
  corp_name     text not null,
  target_price  numeric,               -- 컨센서스 목표주가(원)
  opinion       numeric,               -- 투자의견 점수(1~5, 높을수록 매수)
  est_cnt       int,                   -- 커버 증권사 수(목표주가 제시)
  est_cnt_90d   int,                   -- 최근 90일 내 제시 기관 수
  base_date     date,                  -- 최신 리포트 일자(기준일)
  updated_at    timestamptz not null default now()
);

create index if not exists idx_consensus_estcnt on public.consensus (est_cnt desc);
create index if not exists idx_consensus_corp on public.consensus (corp_name);

alter table public.consensus enable row level security;

drop policy if exists consensus_read on public.consensus;
create policy consensus_read on public.consensus for select using (auth.uid() is not null);
-- 쓰기는 service_role(fetcher) 전용
