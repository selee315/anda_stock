-- ═══════════════════════════════════════════════════════════
--  0005_ai_requests — AI 리서치 질의 큐
--  웹(사용자)이 질문을 넣으면, PC 브릿지(claude -p, service_role)가
--  처리해서 answer 를 채운다.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ai_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  question    text not null,
  answer      text,
  status      text not null default 'pending',   -- pending | processing | done | error
  sources     jsonb,                              -- 참고한 자료 [{title,url}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ai_requests_status_idx on public.ai_requests (status, created_at);
create index if not exists ai_requests_user_idx   on public.ai_requests (user_id, created_at desc);

drop trigger if exists trg_ai_requests_updated on public.ai_requests;
create trigger trg_ai_requests_updated
  before update on public.ai_requests
  for each row execute function public.set_updated_at();

alter table public.ai_requests enable row level security;

drop policy if exists ai_own_select on public.ai_requests;
drop policy if exists ai_own_insert on public.ai_requests;
-- 로그인 사용자는 본인 질의만 조회/생성 (브릿지는 service_role 로 RLS 우회)
create policy ai_own_select on public.ai_requests for select using (auth.uid() = user_id);
create policy ai_own_insert on public.ai_requests for insert with check (auth.uid() = user_id);
