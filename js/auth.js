// ─────────────────────────────────────────────────────────────
//  인증 모듈
//  - Supabase 설정이 있으면: 실제 이메일/비밀번호 로그인
//    (사용자는 ID만 입력 → 내부적으로 id@도메인 으로 매핑)
//  - 설정이 없으면: 미리보기 모드(디자인 확인용, 아무 값이나 입력 시 진입)
// ─────────────────────────────────────────────────────────────
window.Auth = (() => {
  const cfg = window.APP_CONFIG;
  let client = null;

  function getClient() {
    if (client) return client;
    if (!cfg.isConfigured || !window.supabase) return null;
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return client;
  }

  // 입력한 ID가 이메일이면 그대로, 아니면 도메인을 붙여 이메일화
  function toEmail(id) {
    id = id.trim();
    return id.includes("@") ? id : `${id.toLowerCase()}@${cfg.LOGIN_EMAIL_DOMAIN}`;
  }

  async function signIn(id, password) {
    const sb = getClient();
    if (!sb) {
      // 미리보기 모드
      if (!id || !password) throw new Error("ID와 비밀번호를 입력하세요.");
      sessionStorage.setItem("preview_user", id);
      return { user: { id: "preview", label: id }, preview: true };
    }
    const { data, error } = await sb.auth.signInWithPassword({
      email: toEmail(id),
      password,
    });
    if (error) throw new Error(mapError(error.message));
    return { user: data.user, preview: false };
  }

  async function signOut() {
    const sb = getClient();
    if (sb) await sb.auth.signOut();
    sessionStorage.removeItem("preview_user");
  }

  async function currentSession() {
    const sb = getClient();
    if (!sb) {
      const u = sessionStorage.getItem("preview_user");
      return u ? { user: { id: "preview", label: u }, preview: true } : null;
    }
    const { data } = await sb.auth.getSession();
    return data.session ? { user: data.session.user, preview: false } : null;
  }

  function userLabel(session) {
    if (!session) return "";
    if (session.preview) return session.user.label + " (미리보기)";
    const email = session.user.email || "";
    return email.split("@")[0];
  }

  function mapError(msg) {
    if (/Invalid login credentials/i.test(msg)) return "ID 또는 비밀번호가 올바르지 않습니다.";
    if (/Email not confirmed/i.test(msg)) return "이메일 인증이 필요합니다.";
    return msg;
  }

  return { signIn, signOut, currentSession, userLabel, getClient };
})();
