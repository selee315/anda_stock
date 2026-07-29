# Anda Research Terminal

안다자산운용 리서치 터미널 — 블룸버그 스타일 사내 리서치 대시보드.
**정적 HTML/CSS/JS 프런트 + Supabase(인증·DB·Edge Functions)** 구성.
(설계 참고: 안다H `research.ahfms.co.kr` — 본 저장소는 본사용 신규 구축)

## 아키텍처

| 레이어 | 담당 |
|---|---|
| 프런트 | 정적 HTML/JS SPA (프레임워크 없음). Vercel/Netlify 등 정적 배포 |
| 인증 | Supabase Auth (ID → `id@andaasset.com` 매핑, 화면엔 ID만) |
| DB | Supabase Postgres (RLS 보호). 스키마는 `supabase/migrations/` 로 버전관리 |
| 외부데이터·배치 | Supabase Edge Functions + pg_cron (비밀키는 Supabase Vault) |

## 폴더 구조

```
index.html              진입점 (스크립트 로드 순서)
css/app.css             전체 스타일 (K-System 그린 스킨, 라이트/다크)
js/config.js            Supabase URL/anon key + 브랜딩 설정
js/menu.js              좌측 네비게이션(카테고리>탭) 정의 — 원본과 tab id 1:1
js/supabase.js          Supabase 클라이언트 싱글턴
js/auth.js              인증 (Supabase Auth + localhost 개발 미리보기)
js/api.js               데이터 레이어 (table 조회 / Edge Function 호출)
js/handlers.js          탭 id → 렌더 함수 레지스트리 (섹션 구현 위치)
js/app.js               앱 셸 렌더 / 라우팅
supabase/migrations/    DB 마이그레이션 (SQL, 버전관리)
```

## 로컬 실행

```bash
python3 -m http.server 5173   # → http://localhost:5173
```

localhost 에서는 로그인 없이 **"🔧 개발자 미리보기"** 로 바로 입장 가능 (배포 도메인에선 비활성).

## Supabase 세팅

1. 프로젝트 → **Settings → API** 에서 `Project URL`·`anon public` 키를 `js/config.js` 에 입력
   (anon key 는 공개 안전 / `service_role` 키는 **절대 프런트에 넣지 말 것**)
2. **SQL Editor** 에서 `supabase/migrations/` 의 SQL 을 번호 순서대로 실행
   (또는 Supabase CLI: `supabase link` → `supabase db push`)
3. **Authentication → Providers → Email**: "Confirm email" **OFF** (사내 계정은 관리자 발급)
4. 계정 발급: **Authentication → Users → Add user**
   - Email `아이디@andaasset.com` (예: `selee@andaasset.com`) → 로그인 시 `selee` 만 입력

## 배포 (예정)

정적 사이트 → GitHub 연결로 Vercel/Netlify/Cloudflare Pages 배포. 빌드 명령 없음.

## 로드맵

1. ✅ 로그인 + 터미널 뼈대 (8 카테고리 · 전체 탭 · 다크모드)
2. ⬜ 섹션 데이터 연결 — Notion(RESEARCH) → 시세(EODHD)·공시(DART)·매크로(FRED)
3. ⬜ 텔레그램 채널 수집/검색 + 알림·시그널 + AI 요약
4. ⬜ 계정·권한 관리(관리자 발급·임시비번), 배포
