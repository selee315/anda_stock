// ─────────────────────────────────────────────────────────────
//  API 레이어 — 섹션 핸들러가 데이터를 가져오는 단일 창구
//
//  향후 두 경로로 데이터를 받습니다:
//   1) table(name)  : Supabase 테이블/뷰 직접 조회 (배치가 채워둔 데이터)
//   2) fn(name, q)  : Supabase Edge Function 호출 (외부 API 실시간 프록시)
//
//  아직 Edge Function / 테이블이 없으므로 호출 시 NotImplemented 를 던집니다.
//  섹션을 하나씩 붙일 때 이 레이어만 확장하면 됩니다.
// ─────────────────────────────────────────────────────────────
window.API = (() => {
  const cfg = window.APP_CONFIG;

  // Supabase 테이블/뷰 조회 (PostgREST)
  async function table(name, { select = "*", filters = {}, order, limit } = {}) {
    const sb = window.SB.client();
    if (!sb) throw new Error("Supabase 미연결");
    let q = sb.from(name).select(select);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    if (order) q = q.order(order.column, { ascending: order.ascending !== false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  }

  // Edge Function 호출 (외부 데이터 실시간)
  async function fn(name, body = {}) {
    if (!cfg.isConfigured) throw new Error("Supabase 미연결");
    const url = `${cfg.SUPABASE_URL}/functions/v1/${name}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Edge Function ${name}: ${res.status}`);
    return res.json();
  }

  return { table, fn };
})();
