// ─────────────────────────────────────────────────────────────
//  HANDLERS — 탭 id → 렌더 함수 매핑 (원본 구조와 동일)
//
//  각 핸들러는 async (view, ctx) => {...} 형태.
//   - view: 내용을 채울 컨테이너 엘리먼트 (#content)
//   - ctx : { cat, tab }  현재 카테고리/탭 메타
//  데이터는 window.API.table(...) / window.API.fn(...) 로 가져옵니다.
//
//  아직 등록된 핸들러가 없으면 app.js 가 "준비중" placeholder 를 렌더합니다.
// ─────────────────────────────────────────────────────────────
window.HANDLERS = {};

// 공통 유틸
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

// ─── RESEARCH > RESEARCH : Notion 주간 리서치 회의/노트 ───────
window.HANDLERS["research"] = async (view, ctx) => {
  let rows = [];
  try {
    rows = await window.API.table("research_notes", {
      order: { column: "meeting_date", ascending: false },
      limit: 100,
    });
  } catch (e) {
    view.innerHTML = card(
      `<div class="placeholder"><div class="big">⚠️</div>
       <div class="ph-title">데이터를 불러오지 못했습니다</div>
       <div class="ph-desc">${esc(e.message)}</div></div>`);
    return;
  }

  const header = `
    <div class="card">
      <div class="card-title">📚 리서치 노트 <span class="tag">NOTION</span></div>
      <div class="card-sub">안다 투자운용본부 · 주간 리서치 회의 및 리서치 자료 (${rows.length}건)</div>
    </div>`;

  if (!rows.length) {
    view.innerHTML = header + card(
      `<div class="placeholder"><div class="big">🗂️</div>
       <div class="ph-title">표시할 리서치 노트가 없습니다</div>
       <div class="ph-desc">로그인 후 이용 가능하며, Notion 연동 데이터가 여기에 표시됩니다.</div></div>`);
    return;
  }

  const items = rows.map((r) => `
    <div class="rn-item">
      <div class="rn-head">
        <span class="rn-title">${esc(r.title)}</span>
        ${r.category ? `<span class="tag">${esc(r.category)}</span>` : ""}
        ${r.meeting_date ? `<span class="rn-date">${fmtDate(r.meeting_date)}</span>` : ""}
      </div>
      ${r.summary ? `<div class="rn-summary">${esc(r.summary)}</div>` : ""}
      ${r.url ? `<a class="rn-link" href="${esc(r.url)}" target="_blank" rel="noopener">Notion에서 보기 ↗</a>` : ""}
    </div>`).join("");

  view.innerHTML = header + `<div class="card rn-list">${items}</div>`;
};

function card(inner) { return `<div class="card">${inner}</div>`; }
