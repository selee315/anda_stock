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

  // 기업탐방노트: 회사 목록 (parent 없는 회사 페이지) — 섹터별 그룹용
  async function companies() {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    const { data, error } = await sb.from("research_notes")
      .select("id,notion_id,title,sector,summary")
      .eq("source_db", "기업탐방노트").is("parent_id", null)
      .order("title").limit(3000);
    if (error) throw new Error(error.message);
    return data || [];
  }
  // 특정 회사의 하위 노트들
  async function companyNotes(parentNotionId) {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    const { data, error } = await sb.from("research_notes")
      .select("id,title,summary,meeting_date,source_db")
      .eq("parent_id", parentNotionId)
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

  return { counts, list, get, companies, companyNotes, aiAsk, aiGet, aiHistory, PAGE };
})();
