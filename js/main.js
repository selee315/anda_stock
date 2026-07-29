// ─────────────────────────────────────────────────────────────
//  메인 앱: 로그인 게이트 + 레일/서브/컨텐츠 렌더링 + 라우팅
// ─────────────────────────────────────────────────────────────
(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  // ── 테마 ──────────────────────────────────────────────
  const THEME_KEY = "ah_theme";
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(THEME_KEY, t);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "light" ? "dark" : "light");
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  // ── 상태 ──────────────────────────────────────────────
  let activeCat = window.NAV[0].id;
  let activeSec = window.NAV[0].sections[0].id;

  // ── 로그인 화면 ───────────────────────────────────────
  function renderLogin() {
    const b = window.APP_CONFIG.BRAND;
    document.body.innerHTML = `
      <div id="login">
        <button class="mode-toggle" id="loginMode">🌓 모드</button>
        <div class="login-card">
          <div class="login-caption">${b.caption}</div>
          <h1 class="login-title serif">${b.title}</h1>
          <div class="login-sub">${b.subtitle}</div>
          <form class="login-box" id="loginForm">
            <input class="field" id="loginId" placeholder="사용자 ID" autocomplete="username" />
            <input class="field" id="loginPw" type="password" placeholder="비밀번호" autocomplete="current-password" />
            <div class="login-error" id="loginErr"></div>
            <button class="btn-primary" type="submit" id="loginBtn">로그인</button>
          </form>
          <div class="login-foot">🔒 ${window.APP_CONFIG.isConfigured ? "Supabase 인증" : "미리보기 모드 (Supabase 미연결)"}</div>
        </div>
      </div>`;

    $("#loginMode").onclick = toggleTheme;
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const id = $("#loginId").value, pw = $("#loginPw").value;
      const btn = $("#loginBtn"), err = $("#loginErr");
      err.textContent = ""; btn.disabled = true; btn.textContent = "확인 중…";
      try {
        await window.Auth.signIn(id, pw);
        renderApp();
      } catch (ex) {
        err.textContent = ex.message || "로그인 실패";
        btn.disabled = false; btn.textContent = "로그인";
      }
    };
  }

  // ── 앱 셸 ────────────────────────────────────────────
  async function renderApp() {
    const session = await window.Auth.currentSession();
    if (!session) return renderLogin();
    const b = window.APP_CONFIG.BRAND;

    document.body.innerHTML = `
      <div id="app">
        <nav class="rail" id="rail"></nav>
        <aside class="sub"><div id="subHead" class="sub-head"></div><div id="subList"></div></aside>
        <section class="main">
          <header class="topbar">
            <div>
              <div class="caption">${b.caption}</div>
              <h1 id="pageTitle">—</h1>
            </div>
            <div class="host-pill">${b.host}</div>
          </header>
          <div class="content" id="content"></div>
        </section>
      </div>
      ${session.preview ? `<div class="preview-banner">🔎 미리보기 모드입니다 — <b>js/config.js</b> 에 Supabase URL/anon key 를 넣으면 실제 로그인·DB가 활성화됩니다.</div>` : ""}`;

    renderRail(window.Auth.userLabel(session));
    renderSub();
    renderContent();
  }

  function renderRail(userLabel) {
    const rail = $("#rail");
    rail.innerHTML = `<div class="rail-head">CATEGORY</div>`;
    window.NAV.forEach((cat) => {
      const btn = el("button", "rail-item" + (cat.id === activeCat ? " active" : ""));
      btn.innerHTML = `<span class="ico">${cat.icon}</span><span class="lbl">${cat.label}</span>`;
      btn.onclick = () => {
        activeCat = cat.id;
        activeSec = cat.sections[0].id;
        renderRail(userLabel); renderSub(); renderContent();
      };
      rail.appendChild(btn);
    });
    rail.appendChild(el("div", "rail-spacer"));

    const mode = el("button", "rail-mini", `<span>🌓</span><span>모드</span>`);
    mode.onclick = toggleTheme;
    rail.appendChild(mode);

    const out = el("button", "rail-mini", `<span>⎋</span><span>로그아웃</span>`);
    out.title = userLabel;
    out.onclick = async () => { await window.Auth.signOut(); renderLogin(); };
    rail.appendChild(out);
  }

  function renderSub() {
    const cat = window.NAV.find((c) => c.id === activeCat);
    $("#subHead").innerHTML = `<span>${cat.icon}</span><span>${cat.label}</span>`;
    const list = $("#subList");
    list.innerHTML = "";
    cat.sections.forEach((sec) => {
      const btn = el("button", "sub-item" + (sec.id === activeSec ? " active" : ""));
      btn.innerHTML =
        `<span class="s-ico">${sec.icon || "•"}</span>` +
        `<span class="s-lbl">${sec.label}</span>` +
        (sec.live ? `<span class="badge-live">LIVE</span>` : "");
      btn.onclick = () => { activeSec = sec.id; renderSub(); renderContent(); };
      list.appendChild(btn);
    });
  }

  function renderContent() {
    const cat = window.NAV.find((c) => c.id === activeCat);
    const sec = cat.sections.find((s) => s.id === activeSec) || cat.sections[0];
    $("#pageTitle").textContent = sec.label;

    const content = $("#content");
    // 렌더러가 등록돼 있으면 사용, 없으면 placeholder
    const key = `${activeCat}:${activeSec}`;
    const renderer = window.SECTIONS && window.SECTIONS[key];
    if (renderer) { content.innerHTML = ""; renderer(content, { cat, sec }); return; }

    content.innerHTML = `
      <div class="card">
        <div class="card-title">${sec.icon || ""} ${sec.label} <span class="tag">준비중</span></div>
        <div class="card-sub">${cat.label} · ${sec.label}</div>
      </div>
      <div class="card">
        <div class="placeholder">
          <div class="big">🚧</div>
          <div class="ph-title">이 화면은 아직 데이터가 연결되지 않았습니다</div>
          <div class="ph-desc">뼈대(레이아웃·네비게이션·로그인)는 완성됐어요.
          다음 단계에서 Supabase 테이블과 데이터 소스를 이 섹션에 연결하면
          실제 표·차트가 여기에 렌더링됩니다.</div>
        </div>
      </div>`;
  }

  // ── 부팅 ──────────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", async () => {
    const session = await window.Auth.currentSession();
    session ? renderApp() : renderLogin();
  });
})();
