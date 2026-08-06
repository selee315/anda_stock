-- ─────────────────────────────────────────────────────────────
--  국내 공시 (DART) — 최근 공시 피드
--  Mac mini/GitHub Actions fetcher가 service_role로 upsert, 로그인 사용자만 읽음
--  소스: opendart.fss.or.kr /api/list.json (무료)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.disclosures (
  rcept_no        text primary key,      -- 접수번호 (고유)
  corp_code       text,                  -- DART 고유번호(8자리)
  corp_name       text not null,         -- 회사명
  stock_code      text,                  -- 종목코드(6자리, 없으면 빈값)
  market          text,                  -- KOSPI | KOSDAQ | KONEX | 기타
  report_nm       text not null,         -- 공시명(보고서명)
  pblntf_ty       text,                  -- 공시유형 코드(A~J)
  pblntf_ty_label text,                  -- 공시유형 한글
  flr_nm          text,                  -- 공시 제출인
  rcept_dt        date,                  -- 접수일자
  rm              text,                  -- 비고(정정/철회 등)
  url             text,                  -- DART 뷰어 링크
  created_at      timestamptz not null default now()
);

create index if not exists idx_disclosures_rcept_dt on public.disclosures (rcept_dt desc);
create index if not exists idx_disclosures_corp on public.disclosures (corp_name);
create index if not exists idx_disclosures_market on public.disclosures (market);
create index if not exists idx_disclosures_ty on public.disclosures (pblntf_ty);

alter table public.disclosures enable row level security;

drop policy if exists disclosures_read on public.disclosures;
create policy disclosures_read on public.disclosures for select using (auth.uid() is not null);
-- 쓰기는 service_role(fetcher) 전용 → 별도 정책 없음(RLS 우회)
