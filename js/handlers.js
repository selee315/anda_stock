// ─────────────────────────────────────────────────────────────
//  HANDLERS — 탭 id → 렌더 함수 매핑
//  각 핸들러: async (view, ctx) => {...}
//   - view: #content 컨테이너, ctx: { cat, tab }
//  데이터는 window.API.table(...) / window.API.fn(...) 로.
// ─────────────────────────────────────────────────────────────
window.HANDLERS = {};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return esc(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}.${p(dt.getMonth() + 1)}.${p(dt.getDate())}`;
}
function card(inner) { return `<div class="card">${inner}</div>`; }

// 간이 마크다운 → HTML (동기화 스크립트가 만든 마크다운 렌더용)
function mdToHtml(md) {
  if (!md) return "";
  const lines = String(md).split("\n");
  let html = "", inList = false, inCode = false, code = [];
  const inline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      if (inCode) { html += `<pre>${esc(code.join("\n"))}</pre>`; code = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    if (!line.trim()) { closeList(); continue; }
    if (/^#{1,3}\s/.test(line)) {
      closeList();
      const lv = line.match(/^#+/)[0].length;
      html += `<h${lv + 2}>${inline(line.replace(/^#+\s/, ""))}</h${lv + 2}>`;
    } else if (/^---+$/.test(line)) { closeList(); html += "<hr>"; }
    else if (/^[-*]\s|^1\.\s|^-\s\[.\]\s/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^([-*]|\d+\.)\s(\[.\]\s)?/, ""))}</li>`;
    } else if (line.startsWith(">")) { closeList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`; }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  if (inCode) html += `<pre>${esc(code.join("\n"))}</pre>`;
  return html;
}

// ─── RESEARCH > RESEARCH : Notion 리서치 자료 (목록 + 전체 본문 리더) ───
window.HANDLERS["research"] = async (view, ctx) => {
  let rows = [];
  try {
    rows = await window.API.table("research_notes", {
      order: { column: "meeting_date", ascending: false }, limit: 300,
    });
  } catch (e) {
    view.innerHTML = card(`<div class="placeholder"><div class="big">⚠️</div>
      <div class="ph-title">데이터를 불러오지 못했습니다</div>
      <div class="ph-desc">${esc(e.message)}</div></div>`);
    return;
  }

  const renderList = () => {
    const header = card(
      `<div class="card-title">📚 리서치 자료 <span class="tag">NOTION</span></div>
       <div class="card-sub">안다 투자운용본부 · Notion 워크스페이스 연동 (${rows.length}건)</div>`);
    if (!rows.length) {
      view.innerHTML = header + card(`<div class="placeholder"><div class="big">🗂️</div>
        <div class="ph-title">아직 동기화된 자료가 없습니다</div>
        <div class="ph-desc">GitHub Actions 동기화가 실행되면 Notion 자료가 여기에 표시됩니다.</div></div>`);
      return;
    }
    const items = rows.map((r, i) => `
      <div class="rn-item" data-i="${i}">
        <div class="rn-head">
          <span class="rn-title">${r.icon ? esc(r.icon) + " " : ""}${esc(r.title)}</span>
          ${r.category ? `<span class="tag">${esc(r.category)}</span>` : ""}
          ${r.meeting_date ? `<span class="rn-date">${fmtDate(r.meeting_date)}</span>` : ""}
        </div>
        ${r.summary ? `<div class="rn-summary">${esc(r.summary)}</div>` : ""}
      </div>`).join("");
    view.innerHTML = header + `<div class="card rn-list">${items}</div>`;
    view.querySelectorAll(".rn-item").forEach((el) =>
      el.addEventListener("click", () => renderReader(rows[+el.dataset.i])));
  };

  const renderReader = (r) => {
    view.innerHTML = card(`
      <button class="rn-back" id="rnBack">← 목록으로</button>
      <div class="rn-doc">
        <h1 class="rn-doc-title">${r.icon ? esc(r.icon) + " " : ""}${esc(r.title)}</h1>
        <div class="rn-doc-meta">
          ${r.category ? `<span class="tag">${esc(r.category)}</span>` : ""}
          ${r.meeting_date ? `<span>${fmtDate(r.meeting_date)}</span>` : ""}
          ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Notion 원문 ↗</a>` : ""}
        </div>
        <div class="rn-doc-body">${r.content ? mdToHtml(r.content) : `<p class="rn-empty">본문이 아직 동기화되지 않았습니다.</p>`}</div>
      </div>`);
    view.querySelector("#rnBack").addEventListener("click", renderList);
    view.scrollTop = 0;
  };

  renderList();
};
