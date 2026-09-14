-- ─────────────────────────────────────────────────────────────
--  MACRO (FRED) — 미국 매크로 지표 패널 (andaH MONT 이식)
--  소스: FRED 키리스 CSV (fredgraph.csv). 월별 리샘플 + YoY 변환은 수집기에서.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.macro_series (
  series_id     text primary key,      -- FRED 시리즈 ID (M2SL, CPIAUCSL…)
  section       text,                  -- headline | liquidity | inflation | yield | housing
  chart_id      text,
  title         text not null,
  fmt           text,                  -- big | level | pct | rate
  units         text,                  -- null | pc1(YoY%)
  ord           int default 0,
  latest_value  numeric,               -- 최신값(변환 후)
  latest_date   date,
  prev_value    numeric,               -- 직전 관측값
  change        numeric,               -- 최신 - 직전
  points        jsonb default '[]',    -- [{t,v}] 월별 최근 시계열(스파크라인)
  updated_at    timestamptz not null default now()
);

alter table public.macro_series enable row level security;
drop policy if exists macro_read on public.macro_series;
create policy macro_read on public.macro_series for select using (auth.uid() is not null);
