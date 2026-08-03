// ─────────────────────────────────────────────────────────────
//  API 레이어 — research_notes 조회 (검색·출처필터·페이지네이션)
// ─────────────────────────────────────────────────────────────
window.API = (() => {
  const PAGE = 30;

  // 출처별 개수 집계 (필터 탭 뱃지용)
  async function counts() {
    const sb = window.SB.client();
    if (!sb) return { total: 0, bySource: {} };
    const { count: total } = await sb.from("research_notes").select("*", { count: "exact", head: true });
    const bySource = {};
    for (const s of window.SOURCES) {
      const { count } = await sb.from("research_notes")
        .select("*", { count: "exact", head: true }).eq("source_db", s);
      bySource[s] = count || 0;
    }
    return { total: total || 0, bySource };
  }

  // 목록 조회: { source, q, page } → { rows, hasMore }
  async function list({ source = null, q = "", page = 0 } = {}) {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    let query = sb.from("research_notes")
      .select("id,notion_id,title,summary,source_db,category,meeting_date,url,icon,last_edited");
    if (source) query = query.eq("source_db", source);
    if (q && q.trim()) {
      const t = q.trim().replace(/[%,]/g, " ");
      query = query.or(`title.ilike.%${t}%,content.ilike.%${t}%`);
    }
    query = query
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("last_edited", { ascending: false, nullsFirst: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: data || [], hasMore: (data || []).length === PAGE };
  }

  // 단건 본문 조회
  async function get(id) {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    const { data, error } = await sb.from("research_notes").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  }

  // 기업탐방노트: 회사 목록 — "회사명" 기준으로 그룹(중복 컨테이너 병합, 노트는 parent_title 기준)
  async function companies() {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    const map = new Map();   // name -> { sector, count }
    let from = 0;
    for (;;) {
      const { data, error } = await sb.from("research_notes")
        .select("title,sector,parent_title").eq("source_db", "기업탐방노트").range(from, from + 999);
      if (error) throw new Error(error.message);
      if (!data.length) break;
      for (const r of data) {
        if (r.parent_title) {                       // 노트 → 회사 = parent_title
          const e = map.get(r.parent_title) || { sector: null, count: 0 };
          e.count++; map.set(r.parent_title, e);
        } else {                                    // 컨테이너(회사) → 이름=title
          const e = map.get(r.title) || { sector: null, count: 0 };
          if (r.sector) e.sector = r.sector; map.set(r.title, e);
        }
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, sector: v.sector, count: v.count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  // 회사명의 노트들 (parent_title = 회사명)
  async function companyNotes(name) {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    const { data, error } = await sb.from("research_notes")
      .select("id,title,summary,meeting_date").eq("source_db", "기업탐방노트").eq("parent_title", name)
      .order("meeting_date", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data || [];
  }

  // AI 리서치 질의 생성
  async function aiAsk(question) {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    const { data: s } = await sb.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) throw new Error("로그인이 필요합니다 (미리보기 모드에선 AI 사용 불가)");
    const { data, error } = await sb.from("ai_requests").insert({ question, user_id: uid }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  // 내 지난 AI 대화 불러오기 (최근순 → 오래된순으로 뒤집어 반환)
  async function aiHistory(limit = 20) {
    const sb = window.SB.client();
    if (!sb) return [];
    const { data: s } = await sb.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return [];
    const { data } = await sb.from("ai_requests")
      .select("id,question,answer,status").eq("user_id", uid)
      .order("id", { ascending: false }).limit(limit);
    return (data || []).reverse();
  }
  // AI 질의 상태 조회 (폴링)
  async function aiGet(id) {
    const sb = window.SB.client();
    const { data, error } = await sb.from("ai_requests").select("*").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  }

  // 시장 데이터 (EODHD 스냅샷)
  async function marketQuotes() {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    const { data, error } = await sb.from("market_quotes")
      .select("symbol,name,region,kind,price,change,change_p,prev_close,ord,updated_at")
      .order("ord", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  return { counts, list, get, companies, companyNotes, aiAsk, aiGet, aiHistory, marketQuotes, PAGE };
})();
