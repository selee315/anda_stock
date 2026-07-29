# AH Research Terminal

안다H 리서치 터미널 — [research.ahfms.co.kr](https://research.ahfms.co.kr) 스타일의
사내 리서치 대시보드. 정적 HTML/CSS/JS + Supabase(인증·DB) 구성.

## 현재 상태 (v1 — 뼈대)

- ✅ 로그인 화면 (ID / 비밀번호)
- ✅ 카테고리 레일 8종 + 섹션 네비게이션 (MARKET / MACRO / NEWS / TELEGRAM / RESEARCH / QUANT / DISCLOSURE / COMPANY)
- ✅ 라이트/다크 모드
- ✅ Supabase 인증 연동 (미설정 시 "미리보기 모드"로 동작)
- ⬜ 각 섹션 실제 데이터 연결 (다음 단계)

## 폴더 구조

```
index.html          진입점
css/app.css         전체 스타일 (테마 변수 포함)
js/config.js        Supabase URL/anon key 설정  ← 여기를 채우면 실제 로그인 활성화
js/nav.js           좌측 네비게이션 구조 정의
js/auth.js          인증 모듈 (Supabase Auth + 미리보기 모드)
js/main.js          앱 셸 렌더링 / 라우팅
supabase/schema.sql Supabase 초기 스키마
```

## 로컬 실행

정적 파일이라 서버 없이 `index.html` 을 브라우저로 열어도 되지만,
Supabase 연동을 정상 테스트하려면 로컬 서버로 여는 것을 권장합니다.

```bash
python3 -m http.server 5173
# → http://localhost:5173
```

## Supabase 연결 (실제 로그인 활성화)

1. [supabase.com](https://supabase.com) 에서 프로젝트 → **Settings → API** 로 이동
2. `Project URL` 과 `anon public` 키를 복사
3. `js/config.js` 의 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 에 붙여넣기
4. **SQL Editor** 에서 `supabase/schema.sql` 실행
5. **Authentication → Users** 에서 사용자 추가
   - 이메일은 `아이디@ahfms.local` 형식 (예: `hong@ahfms.local`)
   - 그러면 로그인 화면에서는 `hong` 만 입력하면 됩니다

> anon key 는 공개돼도 안전합니다(RLS로 보호). `service_role` 키는 절대 프론트에 넣지 마세요.

## 배포

정적 사이트라 아래 어디에든 배포 가능합니다.

- **Vercel / Netlify**: GitHub 저장소 연결 → 빌드 명령 없음, 출력 디렉터리 `/`
- **Cloudflare Pages / GitHub Pages**: 동일하게 정적 배포

## 다음 단계 (로드맵)

1. 섹션별 데이터 연결 (MARKET 시세부터)
2. 텔레그램 채널 수집/검색 + 알림/시그널 + AI 요약
3. Notion 연동 (RESEARCH 브리프)
4. DART/EODHD/FRED 등 외부 데이터 소스 파이프라인
