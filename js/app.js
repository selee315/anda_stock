// ─────────────────────────────────────────────────────────────
//  사내 리서치 자료 — 리서치 브라우저
//  로그인 게이트 + 출처 필터 + 검색 + 목록(무한스크롤) + 본문 리더
// ─────────────────────────────────────────────────────────────
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

  // ── 테마 ──
  const THEME_KEY = "ahresTheme";
  const applyTheme = (t) => { document.documentElement.setAttribute("data-theme", t); localStorage.setItem(THEME_KEY, t); };
  const toggleTheme = () => applyTheme((document.documentElement.getAttribute("data-theme") || "light") === "light" ? "dark" : "light");
  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  // ── 유틸 ──
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (d) => { if (!d) return ""; const t = new Date(d); if (isNaN(t)) return esc(d); const p = (n) => String(n).padStart(2, "0"); return `${t.getFullYear()}.${p(t.getMonth() + 1)}.${p(t.getDate())}`; };

  // 간이 마크다운 → HTML
  function mdToHtml(md) {
    if (!md) return "";
    const lines = String(md).split("\n"); let html = "", inList = false, inCode = false, code = [];
    const inline = (t) => esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (line.startsWith("```")) { if (inCode) { html += `<pre>${esc(code.join("\n"))}</pre>`; code = []; inCode = false; } else { closeList(); inCode = true; } continue; }
      if (inCode) { code.push(raw); continue; }
      if (!line.trim()) { closeList(); continue; }
      if (/^#{1,3}\s/.test(line)) { closeList(); const lv = line.match(/^#+/)[0].length; html += `<h${lv + 2}>${inline(line.replace(/^#+\s/, ""))}</h${lv + 2}>`; }
      else if (/^---+$/.test(line)) { closeList(); html += "<hr>"; }
      else if (/^[-*]\s|^\d+\.\s/.test(line)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(line.replace(/^([-*]|\d+\.)\s(\[.\]\s)?/, ""))}</li>`; }
      else if (line.startsWith(">")) { closeList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`; }
      else { closeList(); html += `<p>${inline(line)}</p>`; }
    }
    closeList(); if (inCode) html += `<pre>${esc(code.join("\n"))}</pre>`;
    return html;
  }

  // ── 상태 ──
  const state = { source: null, q: "", page: 0, hasMore: true, loading: false, rows: [] };

  // ── 로그인 ──
  function renderLogin() {
    const b = window.APP_CONFIG.BRAND;
    document.body.innerHTML = `
      <button id="themebtn" class="mode-toggle">🌓</button>
      <div id="auth">
        <div class="lbrand"><div class="t">${b.caption}</div><h1>사내 리서치 자료</h1><div class="s">${b.subtitle}</div></div>
        <form class="loginbox" id="loginForm">
          <input id="uid" placeholder="사용자 ID" autocomplete="username" />
          <input id="pw" type="password" placeholder="비밀번호" autocomplete="current-password" />
          <button class="gold" type="submit" id="loginBtn">로그인</button>
          <div id="err"></div>
          <div class="foot">🔒 ${window.APP_CONFIG.isConfigured ? "Supabase 인증" : "미리보기 모드"}</div>
          ${window.Auth.isLocalhost ? `<div class="foot" style="margin-top:8px"><button type="button" id="devBtn" class="linkbtn">🔧 개발자 미리보기</button></div>` : ""}
        </form>
      </div>`;
    $("#themebtn").onclick = toggleTheme;
    if ($("#devBtn")) $("#devBtn").onclick = () => { window.Auth.devSignIn(); boot(); };
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#loginBtn"), err = $("#err"); err.textContent = ""; btn.disabled = true; btn.textContent = "확인 중…";
      try { await window.Auth.signIn($("#uid").value, $("#pw").value); boot(); }
      catch (ex) { err.textContent = ex.message || "로그인 실패"; btn.disabled = false; btn.textContent = "로그인"; }
    };
  }

  // ── 앱 셸 ──
  async function renderApp(session) {
    document.body.innerHTML = `
      <div id="rb">
        <header class="rb-top">
          <div class="rb-brand">📚 <b>사내 리서치 자료</b></div>
          <div class="rb-search"><input id="q" placeholder="제목·내용 검색…" value="${esc(state.q)}" /></div>
          <div class="rb-actions">
            <span class="rb-user">${esc(window.Auth.userLabel(session))}</span>
            <button id="themebtn" class="rb-ic" title="테마">🌓</button>
            <button id="logout" class="rb-ic" title="로그아웃">⎋</button>
          </div>
        </header>
        <div class="rb-tabs" id="tabs"></div>
        <main class="rb-list" id="list"></main>
      </div>
      <div id="reader" class="reader hidden"></div>
      ${session.preview ? `<div class="preview-banner">🔎 미리보기 모드</div>` : ""}`;

    $("#themebtn").onclick = toggleTheme;
    $("#logout").onclick = async () => { await window.Auth.signOut(); renderLogin(); };
    const qEl = $("#q");
    let t; qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = qEl.value; reload(); }, 300); };

    renderTabs({ total: 0, bySource: {} });
    window.API.counts().then(renderTabs).catch(() => {});
    reload();

    $("#list").onscroll = () => {
      const m = $("#list");
      if (!state.loading && state.hasMore && m.scrollTop + m.clientHeight > m.scrollHeight - 300) loadMore();
    };
  }

  function renderTabs(c) {
    const tabs = $("#tabs"); if (!tabs) return;
    const tab = (key, label, n) => `<button class="rb-tab${state.source === key ? " active" : ""}" data-s="${key == null ? "" : esc(key)}">${label}${n != null ? ` <span class="rb-count">${n}</span>` : ""}</button>`;
    let html = tab(null, "전체", c.total);
    for (const s of window.SOURCES) html += tab(s, `${window.SOURCE_ICON[s] || ""} ${s}`, c.bySource[s]);
    tabs.innerHTML = html;
    tabs.querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { state.source = b.dataset.s || null; renderTabs(c); reload(); });
  }

  function reload() { state.page = 0; state.rows = []; state.hasMore = true; $("#list").innerHTML = ""; loadMore(); }

  async function loadMore() {
    if (state.loading || !state.hasMore) return;
    state.loading = true;
    const list = $("#list");
    const spin = el("div", "rb-spin", "불러오는 중…"); list.appendChild(spin);
    try {
      const { rows, hasMore } = await window.API.list({ source: state.source, q: state.q, page: state.page });
      spin.remove();
      if (state.page === 0 && rows.length === 0) {
        list.innerHTML = `<div class="rb-empty">🗂️<div>표시할 자료가 없습니다.</div></div>`;
      }
      for (const r of rows) list.appendChild(rowEl(r));
      state.page++; state.hasMore = hasMore; state.rows.push(...rows);
    } catch (e) {
      spin.textContent = "불러오기 실패: " + e.message;
    } finally { state.loading = false; }
  }

  function rowEl(r) {
    const n = el("button", "rb-item");
    n.innerHTML = `
      <div class="rb-item-main">
        <div class="rb-item-title">${r.icon ? esc(r.icon) + " " : ""}${esc(r.title)}</div>
        ${r.summary ? `<div class="rb-item-sum">${esc(r.summary)}</div>` : ""}
      </div>
      <div class="rb-item-meta">
        ${r.source_db ? `<span class="rb-badge">${esc(r.source_db)}</span>` : ""}
        ${r.meeting_date ? `<span class="rb-date">${fmtDate(r.meeting_date)}</span>` : ""}
      </div>`;
    n.onclick = () => openReader(r.id);
    return n;
  }

  // ── 리더 ──
  async function openReader(id) {
    const rd = $("#reader");
    rd.classList.remove("hidden");
    rd.innerHTML = `<div class="reader-inner"><div class="rb-spin">불러오는 중…</div></div>`;
    document.body.style.overflow = "hidden";
    try {
      const r = await window.API.get(id);
      rd.innerHTML = `
        <div class="reader-inner">
          <div class="reader-bar">
            <button id="rdClose" class="rb-ic" title="닫기">← 목록</button>
            ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="reader-link">Notion 원문 ↗</a>` : ""}
          </div>
          <h1 class="reader-title">${r.icon ? esc(r.icon) + " " : ""}${esc(r.title)}</h1>
          <div class="reader-meta">
            ${r.source_db ? `<span class="rb-badge">${esc(r.source_db)}</span>` : ""}
            ${r.meeting_date ? `<span>${fmtDate(r.meeting_date)}</span>` : ""}
          </div>
          <div class="reader-body">${r.content ? mdToHtml(r.content) : `<p class="rb-empty-t">본문이 없습니다. (노션 원문 참고)</p>`}</div>
        </div>`;
      $("#rdClose").onclick = closeReader;
    } catch (e) {
      rd.innerHTML = `<div class="reader-inner"><div class="reader-bar"><button id="rdClose" class="rb-ic">← 목록</button></div><div class="rb-empty">⚠️<div>${esc(e.message)}</div></div></div>`;
      $("#rdClose").onclick = closeReader;
    }
  }
  function closeReader() { $("#reader").classList.add("hidden"); document.body.style.overflow = ""; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeReader(); });

  // ── 부팅 ──
  async function boot() {
    const session = await window.Auth.currentSession();
    session ? renderApp(session) : renderLogin();
  }
  window.addEventListener("DOMContentLoaded", boot);
})();
