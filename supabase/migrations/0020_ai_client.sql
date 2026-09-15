-- AI 기록을 단말기(브라우저)별로 분리 — 공용 계정(anda)이라도 각자 자기 것만 조회
alter table public.ai_requests add column if not exists client_id text;
create index if not exists ai_requests_client_idx on public.ai_requests (client_id, id desc);
