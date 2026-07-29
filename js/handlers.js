// ─────────────────────────────────────────────────────────────
//  HANDLERS — 탭 id → 렌더 함수 매핑 (원본 구조와 동일)
//
//  각 핸들러는 async (view, ctx) => {...} 형태.
//   - view: 내용을 채울 컨테이너 엘리먼트 (#content)
//   - ctx : { cat, tab }  현재 카테고리/탭 메타
//  데이터는 window.API.table(...) / window.API.fn(...) 로 가져옵니다.
//
//  아직 등록된 핸들러가 없으면 app.js 가 "준비중" placeholder 를 렌더합니다.
//  섹션을 하나씩 구현할 때 여기에 추가하세요. 예:
//
//    HANDLERS['wei'] = async (view, ctx) => {
//      const rows = await API.fn('wei');          // Edge Function
//      view.innerHTML = renderIndexTable(rows);
//    };
// ─────────────────────────────────────────────────────────────
window.HANDLERS = {};
