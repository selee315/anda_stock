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

  // ── 라인 아이콘 (Lucide 스타일) ──
  const ICONS = {
    home: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 8.5V21h14V8.5"/>',
    research: '<path d="M12 7v13"/><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3 3 3 0 0 1 3-3h4.5A1.5 1.5 0 0 1 21 5.5V18a1 1 0 0 1-1 1h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4a1 1 0 0 1-1-1z"/>',
    reports: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
    ai: '<path d="M9 4 10.3 8 14 9l-3.7 1L9 14l-1.3-4L4 9l3.7-1z"/><path d="M17 13l.8 2.2L20 16l-2.2.8L17 19l-.8-2.2L14 16l2.2-.8z"/>',
    stock: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    consensus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    disclosure: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 14.5 2 2 3.5-3.5"/>',
    dividend: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    flows: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/>',
    market: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.3 2.5 14.7 0 17M12 3.5c-2.5 2.3-2.5 14.7 0 17"/>',
    movers: '<path d="m3 16 5-5 4 4 8.5-8.5"/><path d="M15 6.5h5.5V12"/>',
    sector: '<path d="M4 4v16h16"/><path d="M8 16v-4M12.5 16V8M17 16v-6"/>',
    macro: '<path d="M3 12h3.5l2.5 7 4-14 2.5 7H21"/>',
    news: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h6M16 9h1M16 13h1"/>',
    theme: '<path d="M12 3a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9"/>',
    logout: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m15 16 4-4-4-4"/><path d="M19 12H9"/>',
    back: '<path d="M15 19 8 12l7-7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    brand: '<path d="M4 19V9M9 19V5M14 19v-7M19 19v-4"/>',
  };
  const svg = (n, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;

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

  // 섹션 정의 (홈 카드) — cat 으로 홈에서 그룹핑, 확장 가능
  const SECTIONS = [
    { id: "research", cat: "리서치", icon: "📚", name: "사내 리서치 자료", desc: "회의록·기업탐방·세미나·모닝브리핑·Spot Comment 전체 검색·열람", ready: true, big: true },
    { id: "reports", cat: "리서치", icon: "📄", name: "리서치 리포트", desc: "증권사 리포트·목표주가 변동 (FnGuide)", ready: true },
    { id: "ai", cat: "리서치", icon: "🤖", name: "AI 리서치", desc: "사내 리서치 자료 기반 종합·질의응답", ready: true },
    { id: "stock", cat: "종목·컨센서스", icon: "🔎", name: "종목 검색", desc: "종목 하나로 현재가·컨센서스·리포트·공시 통합 조회", ready: true },
    { id: "consensus", cat: "종목·컨센서스", icon: "🔮", name: "컨센서스", desc: "증권사 목표주가·투자의견 집계 (FnGuide)", ready: true },
    { id: "disclosure", cat: "종목·컨센서스", icon: "📑", name: "국내 공시", desc: "코스피·코스닥 DART 공시 실시간 피드", ready: true },
    { id: "dividend", cat: "종목·컨센서스", icon: "💰", name: "배당주", desc: "고배당 ETF·배당 체크리스트 통과 종목 (Naver)", ready: true },
    { id: "flows", cat: "종목·컨센서스", icon: "💧", name: "수급", desc: "외국인·기관 투자자별 순매수 상위 (Naver)", ready: true },
    { id: "market", cat: "시장·매크로", icon: "📈", name: "시장 데이터", desc: "세계지수·환율·원자재 실시간(지연) 시세", ready: true },
    { id: "movers", cat: "시장·매크로", icon: "🚀", name: "급등락", desc: "코스피·코스닥 상승률·하락률 상위 (Naver)", ready: true },
    { id: "sector", cat: "시장·매크로", icon: "💹", name: "섹터 수익률", desc: "KODEX 섹터 ETF 기준 섹터별 등락 (Naver)", ready: true },
    { id: "macro", cat: "시장·매크로", icon: "📐", name: "MACRO", desc: "미국 매크로 지표 — M2·CPI·금리·유동성 (FRED)", ready: true },
    { id: "news", cat: "뉴스", icon: "📰", name: "뉴스", desc: "시장 뉴스 헤드라인 (RSS·Naver)", ready: true },
  ];
  const SECTION_CATS = ["리서치", "종목·컨센서스", "시장·매크로", "뉴스"];

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
  function sidebarNav() {
    const item = (id, name) => `<button class="sb-item" data-v="${id}">${svg(id)}<span>${esc(name)}</span></button>`;
    let html = `<div class="sb-group">${item("home", "홈")}</div>`;
    for (const cat of SECTION_CATS) {
      const items = SECTIONS.filter((s) => s.cat === cat);
      if (!items.length) continue;
      html += `<div class="sb-group"><div class="sb-group-label">${esc(cat)}</div>${items.map((s) => item(s.id, s.name)).join("")}</div>`;
    }
    return html;
  }
  function renderShell() {
    document.body.innerHTML = `
      <div class="shell" id="shell">
        <aside class="sidebar">
          <button class="sb-brand" id="navHome"><span class="sb-logo">${svg("brand")}</span><span class="sb-brand-t">안다 리서치</span></button>
          <nav class="sb-nav">${sidebarNav()}</nav>
          <div class="sb-foot">
            <div class="sb-user" title="${esc(window.Auth.userLabel(SESSION))}">${esc(window.Auth.userLabel(SESSION))}</div>
            <div class="sb-foot-btns">
              <button id="themebtn" class="sb-ic" title="테마">${svg("theme")}</button>
              <button id="logout" class="sb-ic" title="로그아웃">${svg("logout")}</button>
            </div>
          </div>
        </aside>
        <div class="scrim" id="scrim"></div>
        <main class="main">
          <header class="topbar">
            <button class="tb-menu" id="tbMenu" aria-label="메뉴">${svg("menu")}</button>
            <div class="topbar-title" id="tbTitle"></div>
          </header>
          <div id="view"></div>
        </main>
      </div>
      <div id="reader" class="reader hidden"></div>
      ${SESSION.preview ? `<div class="preview-banner">미리보기 모드</div>` : ""}`;
    const closeSb = () => $("#shell").classList.remove("sb-open");
    $("#navHome").onclick = () => { go("home"); closeSb(); };
    $("#themebtn").onclick = toggleTheme;
    $("#logout").onclick = async () => { await window.Auth.signOut(); renderLogin(); };
    $("#tbMenu").onclick = () => $("#shell").classList.toggle("sb-open");
    $("#scrim").onclick = closeSb;
    document.querySelectorAll(".sb-item").forEach((b) => b.onclick = () => { go(b.dataset.v); closeSb(); });
    renderView();
  }

  function go(v) { state.view = v; renderView(); }

  function renderView() {
    document.querySelectorAll(".sb-item").forEach((b) => b.classList.toggle("active", b.dataset.v === state.view));
    const cur = state.view === "home" ? { id: "home", name: "홈" } : (SECTIONS.find((s) => s.id === state.view) || { id: state.view, name: "" });
    const tb = $("#tbTitle"); if (tb) tb.innerHTML = `${svg(cur.id, "tb-ic-svg")}<span>${esc(cur.name)}</span>`;
    const v = $("#view"); v.className = "";
    if (state.view === "research") return renderResearch(v);
    if (state.view === "disclosure") return renderDisclosure(v);
    if (state.view === "consensus") return renderConsensus(v);
    if (state.view === "stock") return renderStock(v);
    if (state.view === "reports") return renderReports(v);
    if (state.view === "market") return renderMarket(v);
    if (state.view === "movers") return renderMovers(v);
    if (state.view === "sector") return renderSector(v);
    if (state.view === "macro") return renderMacro(v);
    if (state.view === "dividend") return renderDividend(v);
    if (state.view === "flows") return renderFlows(v);
    if (state.view === "news") return renderNews(v);
    if (state.view === "ai") return renderAI(v);
    return renderHome(v);
  }

  // ── MACRO (FRED 미국 매크로) ──
  function sparkline(points, w = 160, h = 40) {
    const vals = points.map((p) => p.v).filter((v) => v != null);
    if (vals.length < 2) return "";
    const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
    const step = w / (vals.length - 1);
    const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(" ");
    const up = vals[vals.length - 1] >= vals[0];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.5"/></svg>`;
  }
  function fmtMacro(val, fmt) {
    if (val == null) return "-";
    const n = Number(val);
    if (fmt === "big") return n >= 1e6 ? `$${(n / 1e6).toFixed(2)}조` : n >= 1000 ? `$${(n / 1000).toFixed(2)}조` : `$${n.toLocaleString("ko-KR")}`;
    if (fmt === "pct" || fmt === "rate") return `${n.toFixed(fmt === "rate" ? 2 : 1)}%`;
    return n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  }
  const MACRO_SECS = { headline: "헤드라인", liquidity: "유동성", inflation: "인플레이션", yield: "금리·수익률곡선", housing: "주택" };
  async function renderMacro(v) {
    v.innerHTML = `<div id="market"><div class="ai-head"><div class="rb-title">MACRO</div>
      <div class="ai-sub">미국 매크로 지표 · FRED · 월별 갱신</div></div>
      <div id="macroBody" class="mkt-body"><div class="mkt-loading">불러오는 중…</div></div></div>`;
    let rows; try { rows = await window.API.macro(); } catch (e) { $("#macroBody").innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)}</div>`; return; }
    if (!rows.length) { $("#macroBody").innerHTML = `<div class="ai-empty">📐<div>아직 데이터가 없습니다.</div></div>`; return; }
    const groups = {};
    for (const r of rows) (groups[r.section] ??= []).push(r);
    const order = ["headline", "liquidity", "inflation", "yield", "housing"];
    const secs = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const updated = rows.reduce((m, r) => r.updated_at > m ? r.updated_at : m, "");
    $("#macroBody").innerHTML = secs.map((sec) => `
      <div class="mkt-group">
        <div class="mkt-region">${esc(MACRO_SECS[sec] || sec)}</div>
        <div class="mkt-grid macro-grid">
          ${groups[sec].map((r) => {
            const chg = r.change;
            const chgCls = chg == null ? "" : chg > 0 ? "up" : chg < 0 ? "dn" : "";
            const chgTxt = chg == null ? "" : `${chg > 0 ? "▲" : chg < 0 ? "▼" : ""} ${Math.abs(chg).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`;
            return `<div class="macro-card">
              <div class="macro-name">${esc(r.title)}</div>
              <div class="macro-val">${fmtMacro(r.latest_value, r.fmt)}</div>
              <div class="macro-foot"><span class="macro-chg ${chgCls}">${chgTxt}</span><span class="macro-date">${r.latest_date ? fmtDate(r.latest_date) : ""}</span></div>
              ${sparkline(r.points || [])}
            </div>`;
          }).join("")}
        </div>
      </div>`).join("") + `<div class="mkt-updated">기준: ${updated ? new Date(updated).toLocaleDateString("ko-KR") : "-"} · 출처 FRED</div>`;
  }

  // ── 뉴스 (RSS) ──
  const nstate = { source: null, page: 0, hasMore: true, loading: false };
  function renderNews(v) {
    v.innerHTML = `<div id="rb"><div class="rb-head"><div class="rb-title">뉴스</div></div>
      <div class="rb-tabs" id="ntabs"></div><main class="rb-list" id="nlist"></main></div>`;
    const tabs = [[null, "전체"], ["국내", "국내"], ["해외", "해외"]];
    $("#ntabs").innerHTML = tabs.map(([k, l]) => `<button class="rb-tab${nstate.source === k ? " active" : ""}" data-s="${k || ""}">${l}</button>`).join("");
    $("#ntabs").querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { nstate.source = b.dataset.s || null; renderNews(v); });
    nstate.page = 0; nstate.hasMore = true; $("#nlist").innerHTML = ""; nLoadMore();
    $("#nlist").onscroll = () => { const m = $("#nlist"); if (!nstate.loading && nstate.hasMore && m.scrollTop + m.clientHeight > m.scrollHeight - 300) nLoadMore(); };
  }
  async function nLoadMore() {
    if (nstate.loading || !nstate.hasMore) return; nstate.loading = true;
    const list = $("#nlist"); const spin = el("div", "rb-spin", "불러오는 중…"); list.appendChild(spin);
    try {
      const { rows, hasMore } = await window.API.news({ source: nstate.source, page: nstate.page });
      spin.remove();
      if (nstate.page === 0 && !rows.length) { list.innerHTML = `<div class="rb-empty">📰<div>뉴스가 없습니다.</div></div>`; nstate.hasMore = false; nstate.loading = false; return; }
      for (const r of rows) {
        const a = el("a", "rb-item news-item"); a.href = r.url; a.target = "_blank"; a.rel = "noopener";
        const t = r.published_at ? new Date(r.published_at) : null;
        const ago = t ? `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "";
        a.innerHTML = `<div class="rb-item-main"><div class="rb-item-title">${esc(r.title)}</div>
          ${r.summary ? `<div class="rb-item-sum">${esc(r.summary)}</div>` : ""}
          <div class="news-meta"><span class="news-src ${r.source === "해외" ? "ov" : ""}">${esc(r.source || "")}</span> ${ago}</div></div>`;
        list.appendChild(a);
      }
      nstate.page++; nstate.hasMore = hasMore;
    } catch (e) { spin.remove(); list.insertAdjacentHTML("beforeend", `<div class="rb-empty">⚠️<div>${esc(e.message)}</div></div>`); nstate.hasMore = false; }
    nstate.loading = false;
  }

  // ── 수급 (투자자별 순매수) ──
  const fstate = { inv: "외국인", mkt: "KOSPI" };
  async function renderFlows(v) {
    v.innerHTML = `<div id="rb"><div class="rb-head"><div class="rb-title">수급</div>
      <div class="ai-sub" style="margin-left:auto">투자자별 순매수/순매도 상위 · Naver · 금액 백만원</div></div>
      <div class="rb-tabs" id="ftabs"></div><main class="rb-list" id="fbody"><div class="rb-spin">불러오는 중…</div></main></div>`;
    let snap; try { snap = await window.API.flows(); } catch (e) { $("#fbody").innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)}</div>`; return; }
    if (!snap) { $("#fbody").innerHTML = `<div class="rb-empty">💧<div>아직 데이터가 없습니다.</div></div>`; return; }
    const invs = ["외국인", "기관"], mkts = ["KOSPI", "KOSDAQ"];
    $("#ftabs").innerHTML = invs.map((iv) => `<button class="rb-tab${fstate.inv === iv ? " active" : ""}" data-iv="${iv}">${iv}</button>`).join("")
      + `<span style="width:12px"></span>` + mkts.map((mk) => `<button class="rb-tab${fstate.mkt === mk ? " active" : ""}" data-mk="${mk}">${mk === "KOSPI" ? "코스피" : "코스닥"}</button>`).join("");
    $("#ftabs").querySelectorAll("[data-iv]").forEach((b) => b.onclick = () => { fstate.inv = b.dataset.iv; renderFlows(v); });
    $("#ftabs").querySelectorAll("[data-mk]").forEach((b) => b.onclick = () => { fstate.mkt = b.dataset.mk; renderFlows(v); });
    const cell = (snap.data[fstate.inv] || {})[fstate.mkt] || { buy: [], sell: [] };
    const won = (n) => (n / 100).toLocaleString("ko-KR", { maximumFractionDigits: 0 });  // 백만→억
    const colTable = (rows, buy) => `<div class="flow-col"><div class="flow-col-h ${buy ? "buy" : "sell"}">${buy ? "순매수" : "순매도"} 상위</div>
      ${rows.map((r, i) => `<a class="flow-row" href="https://finance.naver.com/item/main.naver?code=${r.code}" target="_blank" rel="noopener">
        <span class="flow-rank">${i + 1}</span><span class="flow-name">${esc(r.name)}</span>
        <span class="flow-amt ${buy ? "buy" : "sell"}">${won(Math.abs(r.amt_mn))}억</span></a>`).join("")}</div>`;
    $("#fbody").innerHTML = `<div class="flow-wrap">${colTable(cell.buy, true)}${colTable(cell.sell, false)}</div>
      <div class="mkt-updated">기준일: ${snap.basis ? fmtDate(snap.basis) : "-"}</div>`;
  }

  // ── 배당주 ──
  async function renderDividend(v) {
    v.innerHTML = `<div id="rb"><div class="rb-head"><div class="rb-title">배당주</div>
      <div class="ai-sub" style="margin-left:auto">고배당 ETF · 배당 체크리스트 통과 종목 · Naver</div></div>
      <main class="rb-list" id="dvbody"><div class="rb-spin">불러오는 중…</div></main></div>`;
    let snap; try { snap = await window.API.dividend(); } catch (e) { $("#dvbody").innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)}</div>`; return; }
    if (!snap || !snap.data) { $("#dvbody").innerHTML = `<div class="rb-empty">💰<div>아직 데이터가 없습니다.</div></div>`; return; }
    const d = snap.data;
    const pct = (n) => n == null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
    const cls = (n) => n == null ? "" : n > 0 ? "up" : n < 0 ? "dn" : "";
    const stocksHtml = `<div class="dv-sec">배당 체크리스트 통과 종목 <span class="rb-count">${d.stocks.length}</span></div>
      <div class="dv-hint">배당수익률 3%↑ · 배당성향 70%↓ · 3년 감액 없음 · ROE 8%↑ (스크리닝 ${d.screened_at || ""})</div>
      <div class="cns-hdr"><span class="cns-c-name">종목</span><span class="cns-c-num">현재가</span><span class="cns-c-num">배당수익률</span><span class="cns-c-num">배당성향</span><span class="cns-c-num">ROE</span><span class="cns-c-num">ETF편입</span></div>
      ${d.stocks.map((s) => `<div class="cns-row dv-row"><span class="cns-c-name"><b>${esc(s.name)}</b> <span class="cns-code">${s.code}</span><div class="dv-note">${esc(s.note || "")}</div></span>
        <span class="cns-c-num">${s.price ? Number(s.price).toLocaleString("ko-KR") : "-"}</span>
        <span class="cns-c-num cns-tp">${s.yld != null ? s.yld.toFixed(1) + "%" : "-"}</span>
        <span class="cns-c-num">${s.payout}%</span><span class="cns-c-num">${s.roe}%</span>
        <span class="cns-c-num">${s.etf_count}곳</span></div>`).join("")}`;
    const etfsHtml = `<div class="dv-sec" style="margin-top:24px">고배당 ETF <span class="rb-count">${d.etfs.length}</span></div>
      ${d.etfs.map((e) => `<div class="dv-etf"><div class="dv-etf-h"><b>${esc(e.name)}</b> <span class="cns-code">${e.code}</span>
        <span class="dv-etf-ret"><span class="${cls(e.d1)}">1D ${pct(e.d1)}</span> · <span class="${cls(e.m1)}">1M ${pct(e.m1)}</span> · <span class="${cls(e.m3)}">3M ${pct(e.m3)}</span></span></div>
        <div class="dv-etf-cons">${(e.constituents || []).slice(0, 8).map((c) => `<span class="dv-chip">${esc(c.name)}${c.weight ? ` ${c.weight}%` : ""}</span>`).join("")}</div></div>`).join("")}`;
    $("#dvbody").innerHTML = stocksHtml + etfsHtml + `<div class="mkt-updated">기준: ${d.base_date ? fmtDate("20" + (d.base_date.length === 8 ? d.base_date.slice(2, 4) + "-" + d.base_date.slice(4, 6) + "-" + d.base_date.slice(6, 8) : d.base_date)) : "-"}</div>`;
  }

  // ── 급등락 (MOVERS) ──
  const mvstate = { dir: "상승", mkt: "KOSPI" };
  async function renderMovers(v) {
    v.innerHTML = `<div id="rb"><div class="rb-head"><div class="rb-title">급등락</div>
      <div class="ai-sub" style="margin-left:auto">상승률·하락률 상위 · Naver</div></div>
      <div class="rb-tabs" id="mvtabs"></div><main class="rb-list" id="mvbody"><div class="rb-spin">불러오는 중…</div></main></div>`;
    let snap; try { snap = await window.API.movers(); } catch (e) { $("#mvbody").innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)}</div>`; return; }
    if (!snap) { $("#mvbody").innerHTML = `<div class="rb-empty">🚀<div>아직 데이터가 없습니다.</div></div>`; return; }
    $("#mvtabs").innerHTML = [["상승", "▲ 상승률"], ["하락", "▼ 하락률"]].map(([k, l]) => `<button class="rb-tab${mvstate.dir === k ? " active" : ""}" data-d="${k}">${l}</button>`).join("")
      + `<span style="width:12px"></span>` + ["KOSPI", "KOSDAQ"].map((mk) => `<button class="rb-tab${mvstate.mkt === mk ? " active" : ""}" data-mk="${mk}">${mk === "KOSPI" ? "코스피" : "코스닥"}</button>`).join("");
    $("#mvtabs").querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { mvstate.dir = b.dataset.d; renderMovers(v); });
    $("#mvtabs").querySelectorAll("[data-mk]").forEach((b) => b.onclick = () => { mvstate.mkt = b.dataset.mk; renderMovers(v); });
    const rows = (snap.data[mvstate.dir] || {})[mvstate.mkt] || [];
    if (!rows.length) { $("#mvbody").innerHTML = `<div class="rb-empty">🕘<div>표시할 종목이 없습니다.<br>장 시작 전이거나 아직 수집 전일 수 있어요 (장중 시간대 자동 갱신).</div></div>`; return; }
    $("#mvbody").innerHTML = rows.map((r, i) => {
      const up = (r.change_p ?? 0) > 0;
      return `<a class="cns-row mv-row" href="https://finance.naver.com/item/main.naver?code=${r.code}" target="_blank" rel="noopener">
        <span class="flow-rank">${i + 1}</span>
        <span class="cns-c-name"><b>${esc(r.name)}</b> <span class="cns-code">${esc(r.code)}</span></span>
        <span class="cns-c-num">${r.price ? Number(r.price).toLocaleString("ko-KR") : "-"}</span>
        <span class="cns-c-num cns-up ${up ? "up" : "dn"}">${up ? "+" : ""}${r.change_p != null ? r.change_p.toFixed(2) : "-"}%</span></a>`;
    }).join("") + `<div class="mkt-updated">기준: ${snap.fetched_at ? new Date(snap.fetched_at).toLocaleString("ko-KR") : "-"}</div>`;
  }

  // ── 섹터 수익률 ──
  const scstate = { period: "d1" };
  async function renderSector(v) {
    v.innerHTML = `<div id="rb"><div class="rb-head"><div class="rb-title">섹터 수익률</div>
      <div class="ai-sub" style="margin-left:auto">KODEX 섹터 ETF 기준 · Naver</div></div>
      <div class="rb-tabs" id="sctabs"></div><main class="rb-list" id="scbody"><div class="rb-spin">불러오는 중…</div></main></div>`;
    let snap; try { snap = await window.API.sector(); } catch (e) { $("#scbody").innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)}</div>`; return; }
    if (!snap) { $("#scbody").innerHTML = `<div class="rb-empty">💹<div>아직 데이터가 없습니다.</div></div>`; return; }
    const periods = [["d1", "1일"], ["w1", "1주"], ["m1", "1개월"], ["m3", "3개월"]];
    $("#sctabs").innerHTML = periods.map(([k, l]) => `<button class="rb-tab${scstate.period === k ? " active" : ""}" data-p="${k}">${l}</button>`).join("");
    $("#sctabs").querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { scstate.period = b.dataset.p; renderSector(v); });
    const rows = [...snap.data].sort((a, b) => (b[scstate.period] ?? -999) - (a[scstate.period] ?? -999));
    const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r[scstate.period] ?? 0)));
    $("#scbody").innerHTML = rows.map((r) => {
      const val = r[scstate.period]; const up = (val ?? 0) >= 0;
      const w = Math.abs(val ?? 0) / maxAbs * 50;
      return `<div class="sc-row"><span class="sc-name">${esc(r.sector)}</span>
        <div class="sc-bar-wrap"><div class="sc-bar ${up ? "up" : "dn"}" style="width:${w}%;${up ? "margin-left:50%" : "margin-left:" + (50 - w) + "%"}"></div></div>
        <span class="sc-val ${up ? "up" : "dn"}">${up ? "+" : ""}${val != null ? val.toFixed(2) : "-"}%</span></div>`;
    }).join("") + `<div class="mkt-updated">기준일: ${snap.basis ? fmtDate(snap.basis) : "-"}</div>`;
  }

  // ── 종목 통합 뷰 ──
  const skstate = { q: "", sel: null };
  function renderStock(v) {
    v.innerHTML = `<div id="rb"><div class="rb-head"><div class="rb-title">종목 검색</div>
      <div class="rb-search"><input id="skq" placeholder="종목명·종목코드…" value="${esc(skstate.q)}" autocomplete="off" /></div></div>
      <main class="rb-list" id="skbody"></main></div>`;
    const qEl = $("#skq"); let t;
    qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { skstate.q = qEl.value; skstate.sel = null; skSearch(); }, 250); };
    qEl.focus();
    if (skstate.sel) skDetail(skstate.sel); else if (skstate.q) skSearch(); else $("#skbody").innerHTML = `<div class="rb-empty">🔎<div>종목명이나 코드를 입력하세요.<br>현재가·컨센서스 목표주가·증권사 리포트·DART 공시를 한 곳에서 봅니다.</div></div>`;
  }
  async function skSearch() {
    const box = $("#skbody"); if (!box) return;
    box.innerHTML = `<div class="rb-spin">검색 중…</div>`;
    let rows; try { rows = await window.API.stockSearch(skstate.q); } catch (e) { box.innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)}</div>`; return; }
    if (!rows.length) { box.innerHTML = `<div class="rb-empty">🔎<div>"${esc(skstate.q)}" 검색 결과가 없습니다.<br>(컨센서스 대상 종목만 검색됩니다)</div></div>`; return; }
    box.innerHTML = rows.map((r) => {
      const up = (r.upside ?? 0) > 0;
      return `<button class="rb-item sk-result" data-code="${esc(r.stock_code)}" data-name="${esc(r.corp_name)}">
        <div class="rb-item-main"><div class="rb-item-title">${esc(r.corp_name)} <span class="cns-code">${esc(r.stock_code)}</span></div>
          <div class="rp-meta">현재가 ${r.current_price ? Number(r.current_price).toLocaleString("ko-KR") : "-"} · 목표 ${r.target_price ? Number(r.target_price).toLocaleString("ko-KR") : "-"}${r.upside != null ? ` · 상승여력 <span class="${up ? "u-up" : "u-dn"}">${up ? "+" : ""}${r.upside}%</span>` : ""} · ${r.est_cnt || 0}곳</div></div></button>`;
    }).join("");
    box.querySelectorAll(".sk-result").forEach((b) => b.onclick = () => { skstate.sel = { code: b.dataset.code, name: b.dataset.name }; skDetail(skstate.sel); });
  }
  async function skDetail(sel) {
    const box = $("#skbody"); if (!box) return;
    box.innerHTML = `<div class="rb-spin">불러오는 중…</div>`;
    let d; try { d = await window.API.stockDetail(sel.code, sel.name); } catch (e) { box.innerHTML = `<div class="ai-err">⚠️ ${esc(e.message)}</div>`; return; }
    const c = d.consensus, k = d.kis;
    const won = (n) => n == null ? "-" : Number(n).toLocaleString("ko-KR");
    const up = c && (c.upside ?? 0) > 0;
    const price = (k && k.price != null) ? k.price : (c ? c.current_price : null);
    const cp = k ? k.change_p : null;
    const M = [];
    M.push({ l: "현재가", v: `${won(price)}${cp != null ? ` <span class="sk-chg ${cp > 0 ? "u-up" : cp < 0 ? "u-dn" : ""}">${cp > 0 ? "+" : ""}${cp}%</span>` : ""}` });
    if (k && k.sector) M.push({ l: "업종", v: esc(k.sector) });
    if (c) {
      M.push({ l: "컨센서스 목표주가", v: won(c.target_price) });
      M.push({ l: "상승여력", v: c.upside != null ? `<span class="${up ? "u-up" : "u-dn"}">${up ? "+" : ""}${c.upside}%</span>` : "-" });
      M.push({ l: "투자의견", v: c.opinion != null ? c.opinion.toFixed(2) : "-" });
      M.push({ l: "커버 증권사", v: (c.est_cnt || 0) + "곳" });
    }
    if (k) {
      if (k.per != null) M.push({ l: "PER", v: k.per });
      if (k.pbr != null) M.push({ l: "PBR", v: k.pbr });
      if (k.market_cap) M.push({ l: "시가총액", v: (k.market_cap / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "조" });
      if (k.high_52w) M.push({ l: "52주 최저~최고", v: `<span class="sk-52">${won(k.low_52w)}~${won(k.high_52w)}</span>` });
      if (k.foreign_ratio != null) M.push({ l: "외국인 비중", v: k.foreign_ratio + "%" });
    }
    const head = `<button class="co-back" id="skBack">← 검색 결과</button>
      <div class="sk-head">
        <div class="sk-title">${esc(sel.name)} <span class="cns-code">${esc(sel.code)}</span></div>
        <div class="sk-metrics">${M.map((m) => `<div class="sk-m"><span class="sk-m-l">${m.l}</span><span class="sk-m-v">${m.v}</span></div>`).join("")}</div>
        ${!c && !k ? `<div class="rp-meta">현재가·컨센서스 데이터 없음</div>` : ""}
      </div>`;
    // 📒 우리 리서치 (사내 노트 — 클릭하면 전문 열림)
    const ours = (d.notes && d.notes.length) ? `<div class="sk-sec">📒 우리 리서치 <span class="rb-count">${d.notes.length}</span></div>
      ${d.notes.map((n) => `<div class="rb-item co-note sk-note" data-id="${n.id}">
        <div class="rb-item-main"><div class="rb-item-title">${esc(n.title || "(제목 없음)")}</div>${n.summary ? `<div class="rb-item-sum">${esc(n.summary)}</div>` : ""}</div>
        <div class="rb-item-meta">${n.source_db ? `<span class="rb-badge">${esc(n.source_db)}</span>` : ""}${n.meeting_date ? `<span class="rb-date">${fmtDate(n.meeting_date)}</span>` : ""}</div></div>`).join("")}` : "";
    const reps = d.reports.length ? `<div class="sk-sec">📄 증권사 리포트 <span class="rb-count">${d.reports.length}</span></div>
      ${d.reports.map((r) => { const mk = { "상향": " ▲", "하향": " ▼" }[r.tp_dir] || ""; return `<a class="rb-item rp-item" href="${esc(r.url)}" target="_blank" rel="noopener">
        <div class="rb-item-main"><div class="rb-item-title">${esc(r.title || "")}${mk ? `<span class="rp-mark ${r.tp_dir === "상향" ? "up" : "dn"}">${mk.trim()} ${r.tp_dir}</span>` : ""}</div>
        <div class="rp-meta">${[r.house, r.analyst, r.opinion, r.target_price ? "TP " + won(r.target_price) : "", r.report_date].filter(Boolean).join(" · ")}</div></div></a>`; }).join("")}` : "";
    const discs = d.disclosures.length ? `<div class="sk-sec">📑 DART 공시 <span class="rb-count">${d.disclosures.length}</span></div>
      ${d.disclosures.map((r) => `<a class="rb-item dsc-item" href="${esc(r.url)}" target="_blank" rel="noopener">
        <div class="rb-item-main"><div class="dsc-top">${r.pblntf_ty_label ? `<span class="dsc-ty">${esc(r.pblntf_ty_label)}</span>` : ""}</div>
        <div class="rb-item-title">${esc(r.report_nm)}${r.rm ? ` <span class="dsc-rm">${esc(r.rm)}</span>` : ""}</div></div>
        <div class="rb-item-meta"><span class="rb-date">${r.rcept_dt ? fmtDate(r.rcept_dt) : ""}</span></div></a>`).join("")}` : "";
    // 📰 뉴스
    const newsSec = (d.news && d.news.length) ? `<div class="sk-sec">📰 뉴스 <span class="rb-count">${d.news.length}</span></div>
      ${d.news.map((n) => `<a class="rb-item" href="${esc(n.url)}" target="_blank" rel="noopener">
        <div class="rb-item-main"><div class="rb-item-title">${esc(n.title || "")}</div></div>
        <div class="rb-item-meta">${n.source ? `<span class="rb-badge">${esc(n.source)}</span>` : ""}${n.published_at ? `<span class="rb-date">${fmtDate(n.published_at)}</span>` : ""}</div></a>`).join("")}` : "";
    const body = ours + reps + discs + newsSec;
    box.innerHTML = head + (body || `<div class="rb-empty" style="padding:30px">📭<div>이 종목의 리서치·리포트·공시가 아직 없습니다.</div></div>`);
    box.querySelectorAll(".sk-note").forEach((el) => el.onclick = () => openReader(+el.dataset.id));
    $("#skBack").onclick = () => { skstate.sel = null; skSearch(); };
  }

  // ── 증권사 리포트 (FnGuide) ──
  const rpstate = { q: "", tpDir: null, page: 0, hasMore: true, loading: false };
  function renderReports(v) {
    v.innerHTML = `
      <div id="rb">
        <div class="rb-head">
          <div class="rb-title">리서치 리포트</div>
          <div class="rb-search"><input id="rpq" placeholder="종목·제목·증권사 검색…" value="${esc(rpstate.q)}" /></div>
        </div>
        <div id="rpChanged"></div>
        <div class="rb-tabs" id="rptabs"></div>
        <main class="rb-list" id="rplist"></main>
      </div>`;
    const qEl = $("#rpq"); let t;
    qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { rpstate.q = qEl.value; rpReload(); }, 300); };
    const tabs = [[null, "전체"], ["상향", "▲ 목표가 상향"], ["하향", "▼ 목표가 하향"]];
    $("#rptabs").innerHTML = tabs.map(([k, l]) => `<button class="rb-tab${rpstate.tpDir === k ? " active" : ""}" data-t="${k || ""}">${l}</button>`).join("");
    $("#rptabs").querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { rpstate.tpDir = b.dataset.t || null; renderReports(v); });
    // 목표주가 변동 하이라이트 (검색·필터 없을 때만)
    if (!rpstate.q && !rpstate.tpDir) drawReportsChanged();
    rpReload();
    $("#rplist").onscroll = () => { const m = $("#rplist"); if (!rpstate.loading && rpstate.hasMore && m.scrollTop + m.clientHeight > m.scrollHeight - 300) rpLoadMore(); };
  }
  async function drawReportsChanged() {
    let rows; try { rows = await window.API.reportsChanged(30); } catch { return; }
    const box = $("#rpChanged"); if (!box || !rows.length) return;
    box.innerHTML = `<div class="rp-chg-h">🎯 오늘 목표주가 변동 <span class="rb-count">${rows.length}</span></div>
      <div class="rp-chg-strip">${rows.map((r) => {
        const up = r.tp_dir === "상향";
        return `<a class="rp-chip ${up ? "up" : "dn"}" href="${esc(r.url)}" target="_blank" rel="noopener">
          <span class="rp-chip-arrow">${up ? "▲" : "▼"}</span>
          <span class="rp-chip-name">${esc(r.stock_name || "")}</span>
          <span class="rp-chip-tp">${r.target_price ? Number(r.target_price).toLocaleString("ko-KR") : "-"}</span>
          ${r.upside != null ? `<span class="rp-chip-up ${r.upside > 0 ? "up" : "dn"}">${r.upside > 0 ? "+" : ""}${r.upside}%</span>` : ""}
          <span class="rp-chip-house">${esc(r.house || "")}</span>
        </a>`;
      }).join("")}</div>`;
  }
  function rpReload() { const l = $("#rplist"); if (l) l.innerHTML = ""; rpstate.page = 0; rpstate.hasMore = true; rpLoadMore(); }
  async function rpLoadMore() {
    if (rpstate.loading || !rpstate.hasMore) return;
    rpstate.loading = true;
    const list = $("#rplist"); if (!list) { rpstate.loading = false; return; }
    const spin = el("div", "rb-spin", "불러오는 중…"); list.appendChild(spin);
    try {
      const { rows, hasMore } = await window.API.reports({ q: rpstate.q, tpDir: rpstate.tpDir, page: rpstate.page });
      spin.remove();
      if (rpstate.page === 0 && rows.length === 0) { list.innerHTML = `<div class="rb-empty">📄<div>리포트가 없습니다.<br>서버 수집(fetcher)이 아직 실행되지 않았을 수 있어요.</div></div>`; rpstate.hasMore = false; rpstate.loading = false; return; }
      for (const r of rows) {
        const mark = { "상향": " ▲", "하향": " ▼" }[r.tp_dir] || "";
        const markCls = r.tp_dir === "상향" ? "up" : r.tp_dir === "하향" ? "dn" : "";
        const meta = [r.house, r.analyst, r.opinion && r.opinion !== "-" ? `의견 ${r.opinion}` : "",
          r.target_price ? `TP ${Number(r.target_price).toLocaleString("ko-KR")}` : "",
          r.upside != null ? `상승여력 ${r.upside > 0 ? "+" : ""}${r.upside}%` : ""].filter(Boolean).join(" · ");
        const item = el("a", "rb-item rp-item");
        item.href = r.url; item.target = "_blank"; item.rel = "noopener";
        item.innerHTML = `
          <div class="rb-item-main">
            <div class="dsc-top">
              <span class="dsc-corp">${esc(r.stock_name || "")}</span>
              ${r.stock_code ? `<span class="cns-code">${esc(r.stock_code)}</span>` : ""}
              ${mark ? `<span class="rp-mark ${markCls}">${mark.trim()} ${r.tp_dir}</span>` : ""}
            </div>
            <div class="rb-item-title">${esc(r.title || "")}</div>
            <div class="rp-meta">${esc(meta)}</div>
          </div>`;
        list.appendChild(item);
      }
      rpstate.page++; rpstate.hasMore = hasMore;
    } catch (e) {
      spin.remove();
      list.insertAdjacentHTML("beforeend", `<div class="rb-empty">⚠️<div>${esc(e.message)}</div></div>`);
      rpstate.hasMore = false;
    }
    rpstate.loading = false;
  }

  // ── 컨센서스 (FnGuide 목표주가) ──
  const cstate = { q: "", sort: "est_cnt", page: 0, hasMore: true, loading: false };
  function renderConsensus(v) {
    v.innerHTML = `
      <div id="rb">
        <div class="rb-head">
          <div class="rb-title">컨센서스</div>
          <div class="rb-search"><input id="cq" placeholder="회사명·종목코드 검색…" value="${esc(cstate.q)}" /></div>
        </div>
        <div class="rb-tabs" id="csort"></div>
        <div class="cns-hdr"><span class="cns-c-name">종목</span><span class="cns-c-num">현재가</span><span class="cns-c-num">목표주가</span><span class="cns-c-num">상승여력</span><span class="cns-c-num">투자의견</span><span class="cns-c-num">커버</span><span class="cns-c-date">기준일</span></div>
        <main class="rb-list" id="clist"></main>
      </div>`;
    const qEl = $("#cq"); let t;
    qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { cstate.q = qEl.value; cReload(); }, 300); };
    const sorts = [["est_cnt", "커버 많은순"], ["upside", "상승여력 높은순"], ["target_price", "목표주가 높은순"]];
    $("#csort").innerHTML = sorts.map(([k, l]) => `<button class="rb-tab${cstate.sort === k ? " active" : ""}" data-s="${k}">${l}</button>`).join("");
    $("#csort").querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { cstate.sort = b.dataset.s; renderConsensus(v); });
    cReload();
    $("#clist").onscroll = () => { const m = $("#clist"); if (!cstate.loading && cstate.hasMore && m.scrollTop + m.clientHeight > m.scrollHeight - 300) cLoadMore(); };
  }
  function cReload() { const l = $("#clist"); if (l) l.innerHTML = ""; cstate.page = 0; cstate.hasMore = true; cLoadMore(); }
  const wonFmt = (n) => n == null ? "-" : Number(n).toLocaleString("ko-KR");
  const opinionTxt = (o) => o == null ? "" : (o >= 4 ? "매수" : o >= 3 ? "중립" : "매도");
  async function cLoadMore() {
    if (cstate.loading || !cstate.hasMore) return;
    cstate.loading = true;
    const list = $("#clist"); if (!list) { cstate.loading = false; return; }
    const spin = el("div", "rb-spin", "불러오는 중…"); list.appendChild(spin);
    try {
      const { rows, hasMore } = await window.API.consensus({ q: cstate.q, page: cstate.page, sort: cstate.sort });
      spin.remove();
      if (cstate.page === 0 && rows.length === 0) { list.innerHTML = `<div class="rb-empty">🔮<div>컨센서스 데이터가 없습니다.<br>서버 수집(fetcher)이 아직 실행되지 않았을 수 있어요.</div></div>`; cstate.hasMore = false; cstate.loading = false; return; }
      for (const r of rows) {
        const up = r.upside;
        const upCls = up == null ? "" : up > 0 ? "up" : up < 0 ? "dn" : "";
        const upTxt = up == null ? "-" : `${up > 0 ? "+" : ""}${up.toFixed(1)}%`;
        const row = el("div", "cns-row");
        row.innerHTML = `
          <span class="cns-c-name"><b>${esc(r.corp_name)}</b> <span class="cns-code">${esc(r.stock_code)}</span></span>
          <span class="cns-c-num">${wonFmt(r.current_price)}</span>
          <span class="cns-c-num cns-tp">${wonFmt(r.target_price)}</span>
          <span class="cns-c-num cns-up ${upCls}">${upTxt}</span>
          <span class="cns-c-num"><span class="cns-op op-${opinionTxt(r.opinion)}">${r.opinion != null ? r.opinion.toFixed(2) : "-"}</span> <span class="cns-op-t">${opinionTxt(r.opinion)}</span></span>
          <span class="cns-c-num">${r.est_cnt ?? "-"}곳${r.est_cnt_90d ? `<span class="cns-90d"> (90일 ${r.est_cnt_90d})</span>` : ""}</span>
          <span class="cns-c-date">${r.base_date ? fmtDate(r.base_date) : "-"}</span>`;
        list.appendChild(row);
      }
      cstate.page++; cstate.hasMore = hasMore;
    } catch (e) {
      spin.remove();
      list.insertAdjacentHTML("beforeend", `<div class="rb-empty">⚠️<div>${esc(e.message)}</div></div>`);
      cstate.hasMore = false;
    }
    cstate.loading = false;
  }

  // ── 국내 공시 (DART) ──
  const dstate = { market: null, ty: null, q: "", page: 0, hasMore: true, loading: false };
  function renderDisclosure(v) {
    v.innerHTML = `
      <div id="rb">
        <div class="rb-head">
          <div class="rb-title">국내 공시</div>
          <div class="rb-search"><input id="dq" placeholder="회사명·공시명 검색…" value="${esc(dstate.q)}" /></div>
        </div>
        <div class="rb-tabs" id="dmkt"></div>
        <div class="rb-tabs" id="dty"></div>
        <main class="rb-list" id="dlist"></main>
      </div>`;
    const qEl = $("#dq"); let t;
    qEl.oninput = () => { clearTimeout(t); t = setTimeout(() => { dstate.q = qEl.value; dReload(); }, 300); };
    // 시장 필터
    const mkts = [[null, "전체"], ["KOSPI", "코스피"], ["KOSDAQ", "코스닥"]];
    $("#dmkt").innerHTML = mkts.map(([k, l]) => `<button class="rb-tab${dstate.market === k ? " active" : ""}" data-m="${k || ""}">${l}</button>`).join("");
    $("#dmkt").querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { dstate.market = b.dataset.m || null; renderDisclosure(v); });
    // 유형 필터
    const tyBtn = (k, l) => `<button class="rb-tab${dstate.ty === k ? " active" : ""}" data-t="${k == null ? "" : k}">${l}</button>`;
    $("#dty").innerHTML = tyBtn(null, "전체유형") + Object.entries(window.DART_TYPES).map(([c, l]) => tyBtn(c, l)).join("");
    $("#dty").querySelectorAll(".rb-tab").forEach((b) => b.onclick = () => { dstate.ty = b.dataset.t || null; renderDisclosure(v); });
    dReload();
    $("#dlist").onscroll = () => { const m = $("#dlist"); if (!dstate.loading && dstate.hasMore && m.scrollTop + m.clientHeight > m.scrollHeight - 300) dLoadMore(); };
  }
  function dReload() { const l = $("#dlist"); if (l) l.innerHTML = ""; dstate.page = 0; dstate.hasMore = true; dLoadMore(); }
  async function dLoadMore() {
    if (dstate.loading || !dstate.hasMore) return;
    dstate.loading = true;
    const list = $("#dlist"); if (!list) { dstate.loading = false; return; }
    const spin = el("div", "rb-spin", "불러오는 중…"); list.appendChild(spin);
    try {
      const { rows, hasMore } = await window.API.disclosures({ market: dstate.market, ty: dstate.ty, q: dstate.q, page: dstate.page });
      spin.remove();
      if (dstate.page === 0 && rows.length === 0) { list.innerHTML = `<div class="rb-empty">🗂️<div>표시할 공시가 없습니다.<br>서버 수집(fetcher)이 아직 실행되지 않았을 수 있어요.</div></div>`; dstate.hasMore = false; dstate.loading = false; return; }
      for (const r of rows) {
        const item = el("a", "rb-item dsc-item");
        item.href = r.url; item.target = "_blank"; item.rel = "noopener";
        item.innerHTML = `
          <div class="rb-item-main">
            <div class="dsc-top">
              <span class="dsc-corp">${esc(r.corp_name)}</span>
              ${r.market ? `<span class="dsc-mkt ${r.market === "KOSPI" ? "kospi" : "kosdaq"}">${r.market === "KOSPI" ? "코스피" : r.market === "KOSDAQ" ? "코스닥" : esc(r.market)}</span>` : ""}
              ${r.pblntf_ty_label ? `<span class="dsc-ty">${esc(r.pblntf_ty_label)}</span>` : ""}
            </div>
            <div class="rb-item-title">${esc(r.report_nm)}${r.rm ? ` <span class="dsc-rm">${esc(r.rm)}</span>` : ""}</div>
          </div>
          <div class="rb-item-meta">${r.rcept_dt ? `<span class="rb-date">${fmtDate(r.rcept_dt)}</span>` : ""}${r.flr_nm ? `<span class="dsc-flr">${esc(r.flr_nm)}</span>` : ""}</div>`;
        list.appendChild(item);
      }
      dstate.page++; dstate.hasMore = hasMore;
    } catch (e) {
      spin.remove();
      list.insertAdjacentHTML("beforeend", `<div class="rb-empty">⚠️<div>${esc(e.message)}</div></div>`);
      dstate.hasMore = false;
    }
    dstate.loading = false;
  }

  // ── 시장 데이터 (EODHD 스냅샷) ──
  async function renderMarket(v) {
    v.innerHTML = `
      <div id="market">
        <div class="ai-head"><div class="rb-title">시장 데이터</div>
          <div class="ai-sub">세계지수·환율·원자재 지연 시세 · EODHD · 하루 1회 스냅샷</div></div>
        <div id="mktBody" class="mkt-body"><div class="mkt-loading">불러오는 중…</div></div>
      </div>`;
    let rows;
    try { rows = await window.API.marketQuotes(); }
    catch (ex) { $("#mktBody").innerHTML = `<div class="ai-err">⚠️ ${esc(ex.message)}</div>`; return; }
    if (!rows.length) {
      $("#mktBody").innerHTML = `<div class="ai-empty">📈<div>아직 시세 데이터가 없습니다.<br>서버 수집(fetcher)이 아직 실행되지 않았어요.</div></div>`;
      return;
    }
    const groups = {};
    for (const r of rows) (groups[r.region || "기타"] ??= []).push(r);
    const ORDER = ["미국", "한국", "아시아", "유럽", "환율", "원자재", "기타"];
    const rank = (r) => { const i = ORDER.indexOf(r); return i < 0 ? 999 : i; };
    const regions = Object.keys(groups).sort((a, b) => rank(a) - rank(b));
    const fmt = (n, d = 2) => n == null ? "-" : Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
    const updated = rows.reduce((m, r) => r.updated_at > m ? r.updated_at : m, "");
    $("#mktBody").innerHTML = regions.map((reg) => `
      <div class="mkt-group">
        <div class="mkt-region">${esc(reg)}</div>
        <div class="mkt-grid">
          ${groups[reg].map((r) => {
            const up = (r.change_p ?? 0) > 0, dn = (r.change_p ?? 0) < 0;
            const cls = up ? "up" : dn ? "dn" : "";
            const dec = r.kind === "fx" ? (r.symbol.startsWith("USDKRW") || r.symbol.startsWith("USDJPY") ? 2 : 4) : 2;
            return `<div class="mkt-card ${cls}">
              <div class="mkt-name">${esc(r.name)}</div>
              <div class="mkt-price">${fmt(r.price, dec)}</div>
              <div class="mkt-chg">${r.change_p == null ? "" : `${up ? "▲" : dn ? "▼" : ""} ${fmt(Math.abs(r.change ?? 0), dec)} (${up ? "+" : ""}${fmt(r.change_p, 2)}%)`}</div>
            </div>`;
          }).join("")}
        </div>
      </div>`).join("")
      + `<div class="mkt-updated">기준: ${updated ? new Date(updated).toLocaleString("ko-KR") : "-"} · 지연 시세</div>`;
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
        <div class="ai-head"><div class="rb-title">AI 리서치</div>
          <div class="ai-sub">사내 리서치 자료를 스스로 검색·정독하고 웹까지 활용해 답합니다 · Claude Opus (Max)</div></div>
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
          : (it.status === "error" ? `<div class="ai-err">⚠️ ${esc(it.a)}</div>` : linkifyCites(mdToHtml(it.a)))}
      </div>`).join("");
    // 출처 [사내노트 #id] 클릭 → 노트 열기(노션 원문 링크 포함)
    box.querySelectorAll(".ai-cite").forEach((a) => a.onclick = (e) => { e.preventDefault(); openReader(+a.dataset.note); });
    box.scrollTop = box.scrollHeight;
  }

  // AI 답변의 사내노트 출처(#id)를 클릭 가능한 링크로
  function linkifyCites(html) {
    return html.replace(/#(\d{3,6})\b/g, (m, id) =>
      `<a class="ai-cite" data-note="${id}" href="#" title="사내 리서치 노트 열기">${m}</a>`);
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
        ${SECTION_CATS.map((cat) => {
          const items = SECTIONS.filter((s) => s.cat === cat);
          if (!items.length) return "";
          return `<div class="home-cat">${esc(cat)}</div>
            <div class="home-grid">
              ${items.map((s) => `
                <button class="sec-card${s.big ? " big" : ""}${s.ready ? "" : " off"}" data-id="${s.id}" ${s.ready ? "" : "disabled"}>
                  <div class="sec-ic">${svg(s.id)}</div>
                  <div class="sec-body">
                    <div class="sec-name">${esc(s.name)}${s.ready ? "" : ' <span class="sec-soon">준비중</span>'}</div>
                    <div class="sec-desc">${esc(s.desc)}</div>
                  </div>
                </button>`).join("")}
            </div>`;
        }).join("")}
      </div>`;
    v.querySelectorAll(".sec-card").forEach((c) => { if (!c.disabled) c.onclick = () => go(c.dataset.id); });
  }

  // ── 사내 리서치 자료 (브라우저) ──
  function renderResearch(v) {
    v.innerHTML = `
      <div id="rb">
        <div class="rb-head">
          <div class="rb-title">사내 리서치 자료</div>
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
