// ─────────────────────────────────────────────────────────────
//  RSS → market_feed  (시황·주요뉴스 통합 피드에 RSS 소스 투입)
//  국내·해외 금융 RSS를 market_feed(source='rss')로 upsert. 중요도는 스코어러가 채움.
//  필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행: set -a; source scripts/.env; node scripts/collect-rss-feed.mjs
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("환경변수 누락: SUPABASE"); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

// 채널명, url  — 시황에 유의미한 국내 금융/증시 위주 + 핵심 해외
const FEEDS = [
  ["연합뉴스 경제", "https://www.yna.co.kr/rss/economy.xml"],
  ["연합뉴스 산업", "https://www.yna.co.kr/rss/industry.xml"],
  ["연합뉴스 증권", "https://www.yna.co.kr/rss/market.xml"],
  ["한국경제 증권", "https://www.hankyung.com/feed/finance"],
  ["한국경제 경제", "https://www.hankyung.com/feed/economy"],
  ["매일경제", "https://www.mk.co.kr/rss/30000001/"],
  ["이데일리 증권", "https://www.edaily.co.kr/rss/edaily_stock.xml"],
  ["Yahoo Finance", "https://finance.yahoo.com/news/rssindex"],
  ["CNBC Markets", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069"],
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
];

const strip = (s) => (s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? strip(m[1]) : ""; };

function parseRss(xml) {
  const items = [];
  const chunks = xml.split(/<item[ >]/i).slice(1);
  for (const raw of chunks) {
    const c = raw.slice(0, raw.search(/<\/item>/i));
    const title = tag(c, "title");
    let link = tag(c, "link");
    if (!link) { const m = c.match(/<link[^>]*href="([^"]+)"/i); if (m) link = m[1]; }
    const pub = tag(c, "pubDate") || tag(c, "dc:date") || tag(c, "published");
    const desc = tag(c, "description");
    if (title && link) {
      let iso = null;
      const d = new Date(pub);
      if (!Number.isNaN(d.getTime())) iso = d.toISOString();
      items.push({ title, url: link, published_at: iso, body: desc.slice(0, 500) || null });
    }
  }
  return items;
}

(async () => {
  console.log(`📰 RSS→market_feed — ${FEEDS.length}개 피드`);
  const all = new Map();
  for (const [name, url] of FEEDS) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml,*/*" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { console.warn(`  ! ${name}: HTTP ${r.status}`); continue; }
      const xml = await r.text();
      const items = parseRss(xml).slice(0, 25);
      for (const it of items) all.set(it.url, {
        source: "rss", channel: name, external_id: it.url,
        title: it.title, body: it.body, url: it.url, published_at: it.published_at,
      });
      console.log(`  ✓ ${name.padEnd(16)} ${items.length}건`);
    } catch (e) { console.warn(`  ! ${name}: ${String(e.message || e).slice(0, 50)}`); }
  }
  const rows = [...all.values()];
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("market_feed").upsert(rows.slice(i, i + 200), { onConflict: "source,external_id" });
    if (error) { console.error("upsert 실패:", error.message); process.exit(1); }
  }
  console.log(`✓ market_feed 저장 ${rows.length}건 (미채점)`);
  // 14일 지난 피드 정리
  await sb.from("market_feed").delete().eq("source", "rss").lt("published_at", new Date(Date.now() - 14 * 86400000).toISOString());
})();
