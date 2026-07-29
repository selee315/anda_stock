-- ═══════════════════════════════════════════════════════════
--  AH Research Terminal — Supabase 초기 스키마 (v1)
--  Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
--
--  인증은 Supabase Auth(auth.users)를 사용합니다.
--  ID 로그인은 프론트에서 id@ahfms.local 이메일로 매핑합니다.
-- ═══════════════════════════════════════════════════════════

-- 1) 프로필 테이블 -----------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  role         text not null default 'member',   -- member | admin
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 프로필 조회
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

-- 본인 프로필 수정
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- 2) 가입 시 프로필 자동 생성 트리거 -----------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) 로그인 이력 (선택) -----------------------------------------
create table if not exists public.login_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  username   text,
  event      text,                       -- login | logout
  created_at timestamptz not null default now()
);

alter table public.login_events enable row level security;

drop policy if exists "own login events read" on public.login_events;
create policy "own login events read" on public.login_events
  for select using (auth.uid() = user_id);
