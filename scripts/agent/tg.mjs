// 텔레그램 리서치 요약 검색 — node tg.mjs "검색어"
// tg_digests(1시간마다 증권사·리서치 텔레그램 방들을 요약한 것)를 검색해 최근순 출력.
// 검색어 없으면 최근 요약 10건.
import { createClient } from "@supabase/supabase-js";
const sb = createClient((process.env.SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(), { auth: { persistSession: false } });

const q = process.argv.slice(2).join(" ").trim();
let query = sb.from("tg_digests").select("id,ts,channels,body").order("ts", { ascending: false }).limit(15);
if (q) {
  const terms = q.replace(/["'%,()]/g, " ").split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length) query = query.or(terms.map((t) => `body.ilike.%${t}%`).join(","));
}
const { data, error } = await query;
if (error) { console.error("오류:", error.message); process.exit(1); }
for (const r of data || []) {
  console.log(`[${(r.ts || "").slice(0, 16).replace("T", " ")}] (${r.channels || "?"}개 방)`);
  console.log(`    ${(r.body || "").replace(/\s+/g, " ").slice(0, 400)}`);
}
console.log(`\n(${(data || []).length}건 — 텔레그램 시간별 요약)`);
