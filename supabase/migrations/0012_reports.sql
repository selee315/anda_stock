-- ─────────────────────────────────────────────────────────────
--  증권사 리서치 리포트 (FnGuide) — 사내 열람용 (로그인 게이트 뒤, 재배포 아님)
--  소스: fnguide.com ReportsSummary + PdfViewer 본문. 회사 구독 계정으로 수집.
--  메타(종목·증권사·의견·목표가·상향하향) + 본문텍스트(AI 참조용) 저장.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.reports (
  rpt_id        text primary key,      -- FnGuide 리포트 ID
  report_date   date,                  -- 작성일
  stock_name    text,
  stock_code    text,                  -- 6자리
  title         text,
  summary       text,                  -- 목록 요약
  analyst       text,
  house         text,                  -- 증권사
  opinion       text,                  -- 투자의견(BUY/매수/HOLD…)
  target_price  numeric,               -- 목표주가
  tp_dir        text,                  -- 상향 | 하향 | 유지
  current_price numeric,               -- 현재가(Naver)
  upside        numeric,               -- 상승여력 %
  sector        text,
  body          text,                  -- 리포트 본문 텍스트(AI 참조)
  url           text,                  -- FnGuide 뷰어 딥링크
  fetched_at    timestamptz not null default now()
);

create index if not exists idx_reports_date on public.reports (report_date desc);
create index if not exists idx_reports_stock on public.reports (stock_name);
create index if not exists idx_reports_tpdir on public.reports (tp_dir);
create index if not exists idx_reports_sector on public.reports (sector);

alter table public.reports enable row level security;

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select using (auth.uid() is not null);
-- 쓰기는 service_role(수집기) 전용
