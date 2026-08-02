// ─────────────────────────────────────────────────────────────
//  안다 사내 포털 — 홈 + 섹션(사내 리서치 자료)
//  로그인 게이트 → 상단 네비 → 홈(섹션 카드) / 사내 리서치 자료(브라우저)
// ─────────────────────────────────────────────────────────────
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

  const THEME_KEY = "ahresTheme";
  const applyTheme = (t) => { document.documentElement.setAttribute("data-theme", t); localStorage.setItem(THEME_KEY, t); };
  const toggleTheme = () => applyTheme((document.documentElement.getAttribute("data-theme") || "light") === "light" ? "dark" : "light");
  applyTheme(localStorage.getItem(THEME_KEY) || "light");

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (d) => { if (!d) return ""; const t = new Date(d); if (isNaN(t)) return esc(d); const p = (n) => String(n).padStart(2, "0"); return `${t.getFullYear()}.${p(t.getMonth() + 1)}.${p(t.getDate())}`; };

  const mdInline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l) => /^\s*\|?[\s:-]*-[\s:|-]*$/.test(l) && l.includes("-");
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  function mdToHtml(md) {
    if (!md) return "";
    const lines = String(md).split("\n"); let html = "", inList = false, inCode = false, code = [];
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]; const line = raw.replace(/\s+$/, "");
      if (line.startsWith("```")) { if (inCode) { html += `<pre>${esc(code.join("\n"))}</pre>`; code = []; inCode = false; } else { closeList(); inCode = true; } continue; }
      if (inCode) { code.push(raw); continue; }
      // 마크다운 표
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        closeList();
        const head = cells(line); i += 2;
        let rows = "";
        while (i < lines.length && isTableRow(lines[i])) { rows += `<tr>${cells(lines[i]).map((c) => `<td>${mdInline(c)}</td>`).join("")}</tr>`; i++; }
        i--;
        html += `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
        continue;
      }
      if (!line.trim()) { closeList(); continue; }
      if (/^#{1,3}\s/.test(line)) { closeList(); const lv = line.match(/^#+/)[0].length; html += `<h${lv + 2}>${mdInline(line.replace(/^#+\s/, ""))}</h${lv + 2}>`; }
      else if (/^---+$/.test(line)) { closeList(); html += "<hr>"; }
      else if (/^[-*]\s|^\d+\.\s/.test(line)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${mdInline(line.replace(/^([-*]|\d+\.)\s(\[.\]\s)?/, ""))}</li>`; }
      else if (line.startsWith(">")) { closeList(); html += `<blockquote>${mdInline(line.replace(/^>\s?/, ""))}</blockquote>`; }
      else { closeList(); html += `<p>${mdInline(line)}</p>`; }
    }
    closeList(); if (inCode) html += `<pre>${esc(code.join("\n"))}</pre>`;
    return html;
  }

  // 섹션 정의 (홈 카드) — 확장 가능
  const SECTIONS = [
    { id: "research", icon: "📚", name: "사내 리서치 자료", desc: "회의록·기업탐방·세미나·모닝브리핑·Spot·자료실 전체 검색·열람", ready: true, big: true },
    { id: "market", icon: "📈", name: "시장 데이터", desc: "지수·환율·원자재·금리 (준비중)", ready: false },
    { id: "ai", icon: "🤖", name: "AI 리서치", desc: "사내 리서치 자료 기반 종합·질의응답", ready: true },
  ];

  const state = { view: "home", source: null, q: "", page: 0, hasMore: true, loading: false, company: null };

  // ── 로그인 ──
  function renderLogin() {
    const b = window.APP_CONFIG.BRAND;
    document.body.innerHTML = `
      <button id="themebtn" class="mode-toggle">🌓</button>
      <div id="auth">
        <div class="lbrand"><div class="t">${b.caption}</div><h1>안다 리서치 포털</h1><div class="s">${b.subtitle}</div></div>
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

  // ── 셸 ──
  let SESSION = null;
  function renderShell() {
    document.body.innerHTML = `
      <div id="app">
        <header class="nav">
          <button class="nav-brand" id="navHome">🏛️ <b>안다 리서치 포털</b></button>
          <nav class="nav-links">
            <button class="nav-link" data-v="home">홈</button>
            <button class="nav-link" data-v="research">사내 리서치 자료</button>
          </nav>
          <div class="nav-actions">
            <span class="rb-user">${esc(window.Auth.userLabel(SESSION))}</span>
            <button id="themebtn" class="rb-ic" title="테마">🌓</button>
            <button id="logout" class="rb-ic" title="로그아웃">⎋</button>
          </div>
        </header>
        <div id="view"></div>
      </div>
      <div id="reader" class="reader hidden"></div>
      ${SESSION.preview ? `<div class="preview-banner">🔎 미리보기 모드</div>` : ""}`;
    $("#navHome").onclick = () => go("home");
    $("#themebtn").onclick = toggleTheme;
    $("#logout").onclick = async () => { await window.Auth.signOut(); renderLogin(); };
    document.querySelectorAll(".nav-link").forEach((b) => b.onclick = () => go(b.dataset.v));
    renderView();
  }

  function go(v) { state.view = v; renderView(); }

  function renderView() {
    document.querySelectorAll(".nav-link").forEach((b) => b.classList.toggle("active", b.dataset.v === state.view));
    const v = $("#view"); v.className = "";
    if (state.view === "research") return renderResearch(v);
    if (state.view === "ai") return renderAI(v);
    return renderHome(v);
  }

  // ── AI 리서치 ──
  const aiLog = [];            // {q, a, status, progress}
  let aiLoaded = false;
  const AI_EXAMPLES = [
    "방산 섹터 2분기 실적 종합해줘",
    "휴젤 vs 파마리서치 미용의료 비교",
    "정유 섹터 투자포인트와 하반기 전망",
    "최근 회의에서 신규 편입 검토된 종목",
  ];

  function renderAI(v) {
    v.innerHTML = `
      <div id="ai">
        <div class="ai-head"><div class="rb-title">🤖 AI 리서치</div>
          <div class="ai-sub">사내 리서치 자료를 스스로 검색·정독하고 웹까지 활용해 답합니다 · Claude (Max)</div></div>
        <div class="ai-log" id="aiLog"></div>
        <form class="ai-form" id="aiForm">
          <input id="aiQ" placeholder="종목·섹터·이슈를 물어보세요…" autocomplete="off" />
          <button class="gold ai-send" id="aiSend">질문</button>
        </form>
      </div>`;
    drawAiLog();
    $("#aiForm").onsubmit = (e) => { e.preventDefault(); const q = $("#aiQ").value.trim(); if (q) { $("#aiQ").value = ""; askQuestion(q); } };
    if (!aiLoaded && !aiLog.length) {
      aiLoaded = true;
      window.API.aiHistory().then((h) => {
        for (const r of h) aiLog.push({ q: r.question, a: r.answer || "", status: r.status, progress: "" });
        drawAiLog();
      }).catch(() => {});
    }
  }

  async function askQuestion(q) {
    const item = { q, a: "", status: "pending", progress: "" };
    aiLog.push(item); drawAiLog();
    try {
      const req = await window.API.aiAsk(q);
      await pollAi(req.id, item);
    } catch (ex) { item.status = "error"; item.a = ex.message; drawAiLog(); }
  }

  async function pollAi(id, item) {
    for (let i = 0; i < 380; i++) {             // 최대 ~12.6분
      await new Promise((r) => setTimeout(r, 2000));
      let row; try { row = await window.API.aiGet(id); } catch { continue; }
      item.status = row.status; item.a = row.answer || ""; item.progress = row.progress || item.progress;
      drawAiLog();
      if (row.status === "done" || row.status === "error") return;
    }
    item.status = "error"; item.a = "시간 초과 (브릿지가 실행 중인지 확인하세요)"; drawAiLog();
  }

  function drawAiLog() {
    const box = $("#aiLog"); if (!box) return;
    if (!aiLog.length) {
      box.innerHTML = `<div class="ai-empty">🤖<div>사내 리서치 자료를 스스로 뒤져서 답합니다.<br>아래 예시를 눌러보거나 직접 물어보세요.</div>
        <div class="ai-chips">${AI_EXAMPLES.map((e) => `<button class="ai-chip">${esc(e)}</button>`).join("")}</div></div>`;
      box.querySelectorAll(".ai-chip").forEach((c) => c.onclick = () => askQuestion(c.textContent));
      return;
    }
    box.innerHTML = aiLog.map((it) => `
      <div class="ai-q">🙋 ${esc(it.q)}</div>
      <div class="ai-a">
        ${it.status === "pending" || it.status === "processing"
          ? `<div class="ai-think">💭 ${it.status === "processing" ? "작업 중…" : "대기 중…"}</div>
             ${it.progress ? `<div class="ai-progress">${it.progress.split("\n").map((p) => `<div>${esc(p)}</div>`).join("")}</div>` : ""}`
          : (it.status === "error" ? `<div class="ai-err">⚠️ ${esc(it.a)}</div>` : mdToHtml(it.a))}
      </div>`).join("");
    box.scrollTop = box.scrollHeight;
  }

  // ── 홈 ──
  function renderHome(v) {
    v.innerHTML = `
      <div class="home">
        <div class="home-hero">
          <div class="home-cap">ANDA ASSET · 사내 포털</div>
          <h1>안다 리서치 포털</h1>
          <p>사내 리서치 자료를 한 곳에서 검색하고 열람하세요.</p>
        </div>
        <div class="home-grid">
          ${SECTIONS.map((s) => `
            <button class="sec-card${s.big ? " big" : ""}${s.ready ? "" : " off"}" data-id="${s.id}" ${s.ready ? "" : "disabled"}>
              <div class="sec-ic">${s.icon}</div>
              <div class="sec-name">${esc(s.name)}${s.ready ? "" : ' <span class="sec-soon">준비중</span>'}</div>
              <div class="sec-desc">${esc(s.desc)}</div>
            </button>`).join("")}
        </div>
      </div>`;
    v.querySelectorAll(".sec-card").forEach((c) => { if (!c.disabled) c.onclick = () => go(c.dataset.id); });
  }

  // ── 사내 리서치 자료 (브라우저) ──
  function renderResearch(v) {
    v.innerHTML = `
      <div id="rb">
        <div class="rb-head">
          <div class="rb-title">📚 사내 리서치 자료</div>
          <div class="rb-search"><input id="q" placeholder="제목·내용 검색…" value="${esc(state.q)}" /></div>
        </div>
        <div class="rb-tabs" id="tabs"></div>
        <main class="rb-list" id="list"></main>
      </div>`;
    const qEl = $("#q"); let t;
    qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = qEl.value; reload(); }, 300); };
    renderTabs({ total: 0, bySource: {} });
    window.API.counts().then(renderTabs).catch(() => {});
    reload();
    $("#list").onscroll = () => { const m = $("#list"); if (!state.loading && state.hasMore && m.scrollTop + m.clientHeight > m.scrollHeight - 300) loadMore(); };
  }

  function renderTabs(c) {
    const tabs = $("#tabs"); if (!tabs) return;
    const tab = (key, label, n) => `<button class="rb-tab${state.source === key ? " active" : ""}" data-s="${key == null ? "" : esc(key)}">${label}${n != null ? ` <span class="rb-count">${n}</span>` : ""}</button>`;
    let html = tab(null, "전체", c.total);
    for (const s of window.SOURCES) html += tab(s, `${window.SOURCE_ICON[s] || ""} ${s}`, c.bySource[s]);
    tabs.innerHTML = html;
    tabs.querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { state.source = b.dataset.s || null; state.company = null; renderTabs(c); reload(); });
  }

  function reload() {
    const l = $("#list"); if (l) l.innerHTML = "";
    state.page = 0; state.hasMore = true;
    // 기업탐방노트 + 검색어 없음 → 섹터>회사>노트 계층 뷰
    if (state.source === "기업탐방노트" && !state.q.trim()) {
      state.hasMore = false;
      return state.company ? renderCompanyNotes() : renderCompanies();
    }
    loadMore();
  }

  // 회사 목록 (섹터별 그룹)
  async function renderCompanies() {
    const list = $("#list"); if (!list) return;
    list.innerHTML = `<div class="rb-spin">회사 목록 불러오는 중…</div>`;
    try {
      const comps = await window.API.companies();
      const bySector = {};
      for (const c of comps) { const s = c.sector || "기타"; (bySector[s] ||= []).push(c); }
      const sectors = Object.keys(bySector).sort((a, b) => (a === "기타") - (b === "기타") || a.localeCompare(b));
      list.innerHTML = `<div class="co-hint">🏢 회사를 클릭하면 관련 탐방노트가 나옵니다 · 총 ${comps.length}개 회사</div>` +
        sectors.map((s) => `
          <div class="co-sector">
            <div class="co-sector-h">${esc(s)} <span class="rb-count">${bySector[s].length}</span></div>
            <div class="co-grid">${bySector[s].map((c) => `<button class="co-card" data-n="${esc(c.name)}">${esc(c.name)}${c.count ? ` <span class="co-cnt">${c.count}</span>` : ""}</button>`).join("")}</div>
          </div>`).join("");
      list.querySelectorAll(".co-card").forEach((b) => b.onclick = () => { state.company = { name: b.dataset.n }; renderCompanyNotes(); });
    } catch (e) {
      // 계층 컬럼(sector/parent_id) 미적용 등 → 평면 목록으로 폴백
      state.page = 0; state.hasMore = true; if (list) list.innerHTML = "";
      loadMore();
    }
  }

  // 특정 회사의 노트들
  async function renderCompanyNotes() {
    const list = $("#list"); if (!list) return;
    list.innerHTML = `<div class="rb-spin">불러오는 중…</div>`;
    try {
      const notes = await window.API.companyNotes(state.company.name);
      list.innerHTML = `<button class="co-back" id="coBack">← 회사 목록</button>
        <div class="co-title">🏢 ${esc(state.company.name)} <span class="rb-count">${notes.length}건</span></div>` +
        (notes.length ? notes.map((n) => `
          <div class="rb-item co-note" data-id="${n.id}">
            <div class="rb-item-main"><div class="rb-item-title">${esc(n.title)}</div>${n.summary ? `<div class="rb-item-sum">${esc(n.summary)}</div>` : ""}</div>
            <div class="rb-item-meta">${n.meeting_date ? `<span class="rb-date">${fmtDate(n.meeting_date)}</span>` : ""}</div>
          </div>`).join("")
          : `<div class="rb-empty">🗂️<div>이 회사의 노트가 없습니다.</div></div>`);
      $("#coBack").onclick = () => { state.company = null; renderCompanies(); };
      list.querySelectorAll(".co-note").forEach((el) => el.onclick = () => openReader(+el.dataset.id));
    } catch (e) { list.innerHTML = `<div class="rb-spin">실패: ${esc(e.message)}</div>`; }
  }

  async function loadMore() {
    if (state.loading || !state.hasMore) return;
    state.loading = true;
    const list = $("#list"); if (!list) { state.loading = false; return; }
    const spin = el("div", "rb-spin", "불러오는 중…"); list.appendChild(spin);
    try {
      const { rows, hasMore } = await window.API.list({ source: state.source, q: state.q, page: state.page });
      spin.remove();
      if (state.page === 0 && rows.length === 0) list.innerHTML = `<div class="rb-empty">🗂️<div>표시할 자료가 없습니다.</div></div>`;
      for (const r of rows) list.appendChild(rowEl(r));
      state.page++; state.hasMore = hasMore;
    } catch (e) { spin.textContent = "불러오기 실패: " + e.message; }
    finally { state.loading = false; }
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
    const rd = $("#reader"); rd.classList.remove("hidden");
    rd.innerHTML = `<div class="reader-inner"><div class="rb-spin">불러오는 중…</div></div>`;
    document.body.style.overflow = "hidden";
    try {
      const r = await window.API.get(id);
      rd.innerHTML = `
        <div class="reader-inner">
          <div class="reader-bar">
            <button id="rdClose" class="rb-ic">← 목록</button>
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
    SESSION = await window.Auth.currentSession();
    SESSION ? renderShell() : renderLogin();
  }
  window.addEventListener("DOMContentLoaded", boot);
})();
