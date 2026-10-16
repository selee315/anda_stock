// ─────────────────────────────────────────────────────────────
//  금융 캘린더 수집기 → Supabase calendar_events
//  소스(키 없음):
//   · 미국 경제지표 / 한국 매크로 : api.nasdaq.com/api/calendar/economicevents?date=
//   · 미국 실적(대형주)           : api.nasdaq.com/api/calendar/earnings?date=
//   · 옵션/선물 만기일(미국·한국)  : 계산(결정적)
//  필요 env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//  실행: set -a; source scripts/.env; node scripts/fetch-calendar.mjs
//  옵션: CAL_DAYS=45 (앞으로 N일), CAL_MKTCAP=50 (실적 최소 시총 $B), --dry(적재안함)
// ─────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const clean = (v) => (v || "").replace(/\s+/g, "");
const SUPABASE_URL = clean(process.env.SUPABASE_URL);
const SERVICE_KEY  = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const DAYS = parseInt(process.env.CAL_DAYS || "45", 10);
const MIN_MKTCAP = parseFloat(process.env.CAL_MKTCAP || "50") * 1e9;   // $B → $
const DRY = process.argv.includes("--dry");
if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) { console.error("env 누락: SUPABASE_URL/KEY"); process.exit(1); }
const sb = (!DRY) ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HDR = { "User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cldHtml = (s) => (s || "").replace(/&nbsp;/g, "").replace(/&amp;/g, "&").trim();
const iso = (d) => d.toISOString().slice(0, 10);

async function getJSON(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: HDR });
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(500 * (a + 1));
  }
  return null;
}

// ── 경제지표 중요 이벤트 분류 ──────────────────────────────
// [정규식, 중요도(3高2中1低), 한글표기]
const ECON_RULES = [
  [/consumer price index|^cpi|\bcpi\b/i, 3, "소비자물가(CPI)"],
  [/producer price index|\bppi\b/i, 3, "생산자물가(PPI)"],
  [/fomc minutes|fed minutes/i, 2, "FOMC 의사록"],
  [/fomc|federal funds|fed interest rate|interest rate decision/i, 3, "FOMC/기준금리"],
  [/beige book/i, 2, "베이지북"],
  [/jackson hole/i, 3, "잭슨홀"],
  [/fed chair|powell speaks|fed.*speaks|fed.*testimony/i, 2, "연준 발언"],
  [/nonfarm|non-farm payroll/i, 3, "비농업고용(NFP)"],
  [/unemployment rate/i, 2, "실업률"],
  [/average hourly earnings/i, 2, "시간당임금"],
  [/\badp\b/i, 2, "ADP 고용"],
  [/core pce|pce price index|personal consumption/i, 3, "PCE 물가"],
  [/\bgdp\b/i, 3, "GDP"],
  [/retail sales/i, 2, "소매판매"],
  [/ism (manufacturing|services|non-manufacturing)/i, 3, "ISM 지수"],
  [/s&p global.*(manufacturing|services|composite)|flash.*pmi|markit/i, 2, "S&P글로벌 PMI"],
  [/jolts|job openings/i, 2, "JOLTS 구인"],
  [/challenger/i, 1, "챌린저 감원"],
  [/consumer confidence|michigan|consumer sentiment|inflation expectations/i, 2, "소비자심리/기대인플레"],
  [/durable goods/i, 2, "내구재주문"],
  [/initial jobless claims/i, 1, "신규 실업수당"],
  [/empire state|philadelphia fed|philly fed|chicago pmi|richmond|dallas fed|kansas/i, 1, "지역 제조업지수"],
  [/factory orders|nfib/i, 1, "제조업/중소기업"],
  [/trade balance/i, 1, "무역수지"],
  [/industrial production/i, 1, "산업생산"],
  [/housing starts|building permits|existing home|new home sales|pending home/i, 1, "주택지표"],
  [/(10|30)-year.*(note|bond).*auction|treasury auction/i, 1, "국채입찰"],
];
// 한국은행 금통위 등 한국 핵심
const KR_RULES = [
  [/interest rate decision|bok|base rate|monetary policy/i, 3, "한국은행 금통위"],
  [/consumer price index|\bcpi\b|inflation/i, 2, "한국 CPI"],
  [/\bgdp\b/i, 2, "한국 GDP"],
  [/exports|imports|trade balance/i, 1, "수출입/무역"],
  [/current account|business survey|manufacturing pmi|industrial production|retail sales/i, 1, "한국 경기지표"],
];

function classifyEcon(country, name) {
  const isUS = /united states/i.test(country);
  const isKR = /south korea|korea/i.test(country);
  if (!isUS && !isKR) return null;
  const rules = isKR ? KR_RULES : ECON_RULES;
  for (const [re, imp, ko] of rules) if (re.test(name)) return { imp, ko, country: isKR ? "KR" : "US" };
  return null;
}

function parseMktcap(s) {
  const n = parseFloat(String(s || "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const timeKo = (t) => (t || "").includes("pre-market") ? "장전" : (t || "").includes("after-hours") ? "장후" : "";

// ── 만기일 계산 ────────────────────────────────────────────
function nthWeekday(year, month, weekday, n) {  // month 0-11, weekday 0=Sun..5=Fri..4=Thu
  const d = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === weekday) { count++; if (count === n) return new Date(d); }
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCMonth() !== month) return null;
  }
}
function expiriesBetween(start, end) {
  const out = [];
  const y0 = start.getUTCFullYear(), y1 = end.getUTCFullYear();
  for (let y = y0; y <= y1; y++) {
    for (let m = 0; m < 12; m++) {
      const usFri = nthWeekday(y, m, 5, 3);        // 미국: 셋째 금요일
      const krThu = nthWeekday(y, m, 4, 2);        // 한국: 둘째 목요일(KOSPI200 옵션)
      const quarter = [2, 5, 8, 11].includes(m);
      if (usFri) out.push({ date: usFri, country: "US", title: quarter ? "미국 쿼드러플 위칭(선물·옵션 동시만기)" : "미국 옵션 만기일", imp: quarter ? 3 : 2 });
      if (krThu) out.push({ date: krThu, country: "KR", title: quarter ? "코스피200 선물·옵션 동시만기" : "코스피200 옵션 만기일", imp: quarter ? 3 : 2 });
    }
  }
  return out.filter((e) => e.date >= start && e.date <= end);
}

(async () => {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const endD = new Date(today); endD.setUTCDate(endD.getUTCDate() + DAYS);
  const rows = [];
  const seen = new Set();
  const add = (r) => { if (!seen.has(r.uniq)) { seen.add(r.uniq); rows.push(r); } };

  // 1) 날짜별 경제지표 + 실적
  for (let i = 0; i <= DAYS; i++) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() + i);
    const ds = iso(d);
    // 경제지표
    const ec = await getJSON(`https://api.nasdaq.com/api/calendar/economicevents?date=${ds}`);
    const erows = (ec && ec.data && ec.data.rows) || [];
    for (const r of erows) {
      const cls = classifyEcon(r.country || "", r.eventName || "");
      if (!cls) continue;
      const title = `${cls.ko}` + (cldHtml(r.eventName) && !cls.ko.includes(cldHtml(r.eventName)) ? ` · ${cldHtml(r.eventName)}` : "");
      add({
        event_date: ds, event_time: cldHtml(r.gmt) || null, country: cls.country,
        category: "econ", title: cls.ko, ticker: null, importance: cls.imp,
        detail: { event: cldHtml(r.eventName), actual: cldHtml(r.actual), consensus: cldHtml(r.consensus), previous: cldHtml(r.previous), time: cldHtml(r.gmt) },
        source: "nasdaq", uniq: `econ|${ds}|${cls.country}|${cls.ko}`,   // 세부지표(MoM/YoY)는 1개로 합침
      });
    }
    await sleep(140);
    // 실적(대형주)
    const ea = await getJSON(`https://api.nasdaq.com/api/calendar/earnings?date=${ds}`);
    const arows = (ea && ea.data && ea.data.rows) || [];
    for (const r of arows) {
      const mc = parseMktcap(r.marketCap);
      if (mc < MIN_MKTCAP) continue;
      const imp = mc >= 200e9 ? 3 : mc >= 80e9 ? 2 : 1;
      add({
        event_date: ds, event_time: timeKo(r.time) || null, country: "US",
        category: "earnings", title: `${r.name || r.symbol}`, ticker: r.symbol || null, importance: imp,
        detail: { time: timeKo(r.time), mktcap: r.marketCap, epsForecast: r.epsForecast, fq: r.fiscalQuarterEnding },
        source: "nasdaq", uniq: `earnings|${ds}|${r.symbol}`,
      });
    }
    await sleep(140);
    if (i % 10 === 0) console.log(`   ...${ds} 까지 (누적 ${rows.length})`);
  }

  // 2) 만기일(계산)
  for (const e of expiriesBetween(today, endD)) {
    const ds = iso(e.date);
    add({
      event_date: ds, event_time: null, country: e.country, category: "expiry",
      title: e.title, ticker: null, importance: e.imp, detail: {}, source: "calc",
      uniq: `expiry|${ds}|${e.country}`,
    });
  }

  rows.sort((a, b) => a.event_date.localeCompare(b.event_date) || b.importance - a.importance);
  const byCat = rows.reduce((m, r) => (m[r.category] = (m[r.category] || 0) + 1, m), {});
  console.log(`✓ 수집 ${rows.length}건 — econ ${byCat.econ || 0} · earnings ${byCat.earnings || 0} · expiry ${byCat.expiry || 0}`);
  console.log("  미리보기(중요도 높은 순 상위 10):");
  for (const r of [...rows].sort((a, b) => b.importance - a.importance).slice(0, 10))
    console.log(`   [${r.event_date}] ${"★".repeat(r.importance)} (${r.country}/${r.category}) ${r.title}${r.ticker ? " " + r.ticker : ""}`);

  if (DRY) { console.log("(--dry: 적재 생략)"); return; }

  // 적재(오늘 이후 이벤트만 upsert — 과거 지난 것은 유지/정리 선택)
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("calendar_events").upsert(rows.slice(i, i + 500), { onConflict: "uniq" });
    if (error) { console.error("upsert 실패:", error.message); process.exit(1); }
  }
  console.log(`✓ Supabase calendar_events 적재 ${rows.length}건`);
})();
