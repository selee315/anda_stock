// ─────────────────────────────────────────────────────────────
//  AH Research Terminal — 설정 파일
//
//  Supabase 프로젝트 대시보드 → Settings → API 에서 값을 복사해
//  아래 두 줄을 채우면 실제 로그인/DB 연결이 활성화됩니다.
//  값이 비어 있으면 "미리보기 모드"로 동작합니다(디자인 확인용).
//
//  ⚠️ anon key 는 공개되어도 안전한 키입니다(RLS로 보호).
//     service_role key 는 절대 여기에 넣지 마세요.
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  SUPABASE_URL: "https://bbetyysxpunhumxfgbqw.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiZXR5eXN4cHVuaHVteGZnYnF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTkxOTQsImV4cCI6MjEwMDg3NTE5NH0.IObvxS4T6H5PHt3Piy2i4baBe2JWvI7D9tE5jBHGOwY",

  // 로그인 ID를 이메일로 매핑할 때 쓰는 내부 도메인.
  // 사용자는 "hong" 처럼 ID만 입력하고, 내부적으로 hong@ahfms.local 로 처리됩니다.
  LOGIN_EMAIL_DOMAIN: "ahfms.co.kr",

  BRAND: {
    title: "AH Research",
    subtitle: "안다H · research.ahfms.co.kr",
    caption: "ANDA H · RESEARCH TERMINAL",
    host: "research.ahfms.co.kr",
  },
};

window.APP_CONFIG.isConfigured = !!(
  window.APP_CONFIG.SUPABASE_URL && window.APP_CONFIG.SUPABASE_ANON_KEY
);
