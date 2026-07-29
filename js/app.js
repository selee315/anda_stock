// ─────────────────────────────────────────────────────────────
//  앱 셸: 로그인 게이트 + 레일/섹션/컨텐츠 렌더 + 라우팅
// ─────────────────────────────────────────────────────────────
(() => {
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const $ = (s) => document.querySelector(s);

  // ── 테마 ──
  const THEME_KEY = "ahresTheme";
  const applyTheme = (t) => { document.documentElement.setAttribute("data-theme", t); localStorage.setItem(THEME_KEY, t); };
  const toggleTheme = () => {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "light" ? "dark" : "light");
  };
  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  // ── 상태 ──
  let activeCat = window.MENU[0].id;
  let activeTab = window.MENU[0].tabs[0].id;

  // ── 로그인 ──
  function renderLogin() {
    const b = window.APP_CONFIG.BRAND;
    document.body.innerHTML = `
      <button id="themebtn">🌓 모드</button>
      <div id="auth">
        <div class="lbrand">
          <div class="t">${b.caption}</div>
          <h1>${b.title}</h1>
          <div class="s">${b.subtitle}</div>
        </div>
        <form class="loginbox" id="loginForm">
          <input id="uid" placeholder="사용자 ID" autocomplete="username" />
          <input id="pw" type="password" placeholder="비밀번호" autocomplete="current-password" />
          <button class="gold" type="submit" id="loginBtn">로그인</button>
          <div id="err"></div>
          <div class="foot">🔒 ${window.APP_CONFIG.isConfigured ? "Supabase 인증" : "미리보기 모드 (Supabase 미연결)"}</div>
          ${window.Auth.isLocalhost ? `<div class="foot" style="margin-top:8px"><button type="button" id="devBtn" style="background:none;border:0;color:var(--dim);text-decoration:underline;font-size:11px;cursor:pointer">🔧 개발자 미리보기 (로그인 없이 입장)</button></div>` : ""}
        </form>
      </div>`;
    $("#themebtn").onclick = toggleTheme;
    if ($("#devBtn")) $("#devBtn").onclick = () => { window.Auth.devSignIn(); renderApp(); };
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#loginBtn"), err = $("#err");
      err.style.color = "var(--dim)"; err.textContent = "확인 중…"; btn.disabled = true;
      try {
        await window.Auth.signIn($("#uid").value, $("#pw").value);
        renderApp();
      } catch (ex) {
        err.style.color = "var(--down)"; err.textContent = ex.message || "로그인 실패";
        btn.disabled = false;
      }
    };
  }

  // ── 앱 셸 ──
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
            <div><div class="caption">${b.caption}</div><h1 id="pageTitle">—</h1></div>
            <div class="host-pill">${b.host}</div>
          </header>
          <div class="content" id="content"></div>
        </section>
      </div>
      ${session.preview ? `<div class="preview-banner">🔎 미리보기 모드 — <b>js/config.js</b> 에 Supabase 키를 넣으면 실제 로그인·DB가 활성화됩니다.</div>` : ""}`;
    renderRail(window.Auth.userLabel(session));
    renderSub();
    renderContent();
  }

  function renderRail(userLabel) {
    const rail = $("#rail");
    rail.innerHTML = `<div class="rail-head">CATEGORY</div>`;
    window.MENU.forEach((cat) => {
      const btn = el("button", "rail-item" + (cat.id === activeCat ? " active" : ""));
      btn.innerHTML = `<span class="ico">${cat.ic}</span><span class="lbl">${cat.name}</span>`;
      btn.onclick = () => { activeCat = cat.id; activeTab = cat.tabs[0].id; renderRail(userLabel); renderSub(); renderContent(); };
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
    const cat = window.MENU.find((c) => c.id === activeCat);
    $("#subHead").innerHTML = `<span>${cat.ic}</span><span>${cat.name}</span>`;
    const list = $("#subList");
    list.innerHTML = "";
    cat.tabs.forEach((tab) => {
      const btn = el("button", "sub-item" + (tab.id === activeTab ? " active" : ""));
      btn.innerHTML =
        `<span class="s-ico">${tab.ic || "•"}</span><span class="s-lbl">${tab.label}</span>` +
        (tab.live ? `<span class="badge-live">LIVE</span>` : "");
      btn.onclick = () => { activeTab = tab.id; renderSub(); renderContent(); };
      list.appendChild(btn);
    });
  }

  async function renderContent() {
    const cat = window.MENU.find((c) => c.id === activeCat);
    const tab = cat.tabs.find((t) => t.id === activeTab) || cat.tabs[0];
    $("#pageTitle").textContent = tab.label;
    const content = $("#content");

    const handler = window.HANDLERS[tab.id];
    if (handler) {
      content.innerHTML = `<div class="placeholder"><div class="ph-desc">불러오는 중…</div></div>`;
      try { content.innerHTML = ""; await handler(content, { cat, tab }); }
      catch (ex) {
        content.innerHTML = `<div class="card"><div class="placeholder">
          <div class="big">⚠️</div><div class="ph-title">데이터를 불러오지 못했습니다</div>
          <div class="ph-desc">${(ex && ex.message) || ex}</div></div></div>`;
      }
      return;
    }

    content.innerHTML = `
      <div class="card">
        <div class="card-title">${tab.ic || ""} ${tab.label} <span class="tag">준비중</span></div>
        <div class="card-sub">${cat.name} · ${tab.label}</div>
      </div>
      <div class="card"><div class="placeholder">
        <div class="big">🚧</div>
        <div class="ph-title">이 화면은 아직 데이터가 연결되지 않았습니다</div>
        <div class="ph-desc">뼈대(레이아웃·네비게이션·로그인)는 완성됐어요.
        <code>js/handlers.js</code> 에 <b>${tab.id}</b> 핸들러를 등록하고
        Supabase 테이블/Edge Function 을 연결하면 여기에 실제 표·차트가 렌더링됩니다.</div>
      </div></div>`;
  }

  // ── 부팅 ──
  window.addEventListener("DOMContentLoaded", async () => {
    const session = await window.Auth.currentSession();
    session ? renderApp() : renderLogin();
  });
})();
