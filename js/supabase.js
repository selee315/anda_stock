// ─────────────────────────────────────────────────────────────
//  Supabase 클라이언트 싱글턴
//  설정이 없으면 client() 가 null → auth/api 가 "미리보기 모드"로 폴백
// ─────────────────────────────────────────────────────────────
window.SB = (() => {
  const cfg = window.APP_CONFIG;
  let _client = null, _tried = false;

  function client() {
    if (_tried) return _client;
    _tried = true;
    if (cfg.isConfigured && window.supabase) {
      _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
    return _client;
  }

  function isReady() {
    return !!(cfg.isConfigured && window.supabase);
  }

  return { client, isReady };
})();
