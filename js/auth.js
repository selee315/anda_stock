// ─────────────────────────────────────────────────────────────
//  인증 모듈 (Supabase Auth)
//  - 사용자는 ID만 입력 → 내부적으로 id@도메인 이메일로 매핑
//  - Supabase 미설정 시: 미리보기 모드(아무 값이나 입력 시 진입)
// ─────────────────────────────────────────────────────────────
window.Auth = (() => {
  const cfg = window.APP_CONFIG;

  // 개발 편의: localhost 에서만 로그인 없이 진입 허용 (배포 도메인에선 무효)
  const isLocalhost = ["localhost", "127.0.0.1", ""].includes(location.hostname);

  function devSignIn() {
    if (!isLocalhost) throw new Error("개발 미리보기는 localhost 에서만 가능합니다.");
    sessionStorage.setItem("dev_preview", "개발자");
    return { user: { id: "dev", label: "개발자" }, preview: true };
  }

  function toEmail(id) {
    id = (id || "").trim();
    return id.includes("@") ? id : `${id.toLowerCase()}@${cfg.LOGIN_EMAIL_DOMAIN}`;
  }

  async function signIn(id, password) {
    const sb = window.SB.client();
    if (!sb) {
      if (!id || !password) throw new Error("ID와 비밀번호를 입력하세요.");
      sessionStorage.setItem("preview_user", id);
      return { user: { id: "preview", label: id }, preview: true };
    }
    const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(id), password });
    if (error) throw new Error(mapError(error.message));
    return { user: data.user, preview: false };
  }

  async function signOut() {
    const sb = window.SB.client();
    if (sb) await sb.auth.signOut();
    sessionStorage.removeItem("preview_user");
    sessionStorage.removeItem("dev_preview");
  }

  async function currentSession() {
    // localhost 개발 미리보기 세션 우선 (배포 도메인에선 isLocalhost=false 라 무시)
    if (isLocalhost) {
      const dev = sessionStorage.getItem("dev_preview");
      if (dev) return { user: { id: "dev", label: dev }, preview: true };
    }
    const sb = window.SB.client();
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
    return (session.user.email || "").split("@")[0];
  }

  function mapError(msg) {
    if (/Invalid login credentials/i.test(msg)) return "ID 또는 비밀번호가 올바르지 않습니다.";
    if (/Email not confirmed/i.test(msg)) return "이메일 인증이 필요합니다. (관리자에게 문의)";
    return msg;
  }

  return { signIn, signOut, currentSession, userLabel, devSignIn, isLocalhost };
})();
