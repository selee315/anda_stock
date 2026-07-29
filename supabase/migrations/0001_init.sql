-- ═══════════════════════════════════════════════════════════
--  0001_init — 기반 스키마 (인증·프로필·권한·감사로그)
--  Anda Research Terminal
--
--  적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행
--       (또는 supabase CLI: supabase db push)
--  멱등(idempotent)하게 작성 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
--  공통: updated_at 자동 갱신 트리거 함수
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
--  프로필 (auth.users 1:1 확장)
--  role: admin | member | guest
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  role         text not null default 'member'
               check (role in ('admin','member','guest')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
--  관리자 판별 (RLS 재귀 방지용 security definer)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
$$;

-- ─────────────────────────────────────────────────────────────
--  가입 시 프로필 자동 생성
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- ─────────────────────────────────────────────────────────────
--  RLS: 프로필
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists profiles_self_select  on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;
drop policy if exists profiles_self_update  on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

create policy profiles_self_select  on public.profiles for select using (auth.uid() = id);
create policy profiles_admin_select on public.profiles for select using (public.is_admin());
create policy profiles_self_update  on public.profiles for update using (auth.uid() = id);
create policy profiles_admin_update on public.profiles for update using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
--  감사 로그 (로그인/주요 행위 기록) — admin 만 조회
-- ─────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  username   text,
  action     text not null,          -- login | logout | ...
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_admin_select on public.audit_log;
drop policy if exists audit_self_insert  on public.audit_log;
create policy audit_admin_select on public.audit_log for select using (public.is_admin());
create policy audit_self_insert  on public.audit_log for insert with check (auth.uid() = user_id);
