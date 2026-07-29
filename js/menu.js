// ─────────────────────────────────────────────────────────────
//  MENU — 화면 전체 지도 (원본 research.ahfms.co.kr 와 tab id 1:1 일치)
//  L1 카테고리(레일) > L2 탭(섹션). id 는 향후 Supabase Edge Function
//  라우트(/functions/v1/<id>) 및 HANDLERS 키와 매칭됩니다.
// ─────────────────────────────────────────────────────────────
window.MENU = [
  { id: "market", ic: "📊", name: "MARKET", tabs: [
    { id: "msci",       ic: "📈", label: "MSCI",            live: true },
    { id: "wei",        ic: "🌏", label: "WEI 지수",         live: true },
    { id: "weif",       ic: "⚡", label: "WEIF 선물",        live: true },
    { id: "fxc",        ic: "💱", label: "FX 환율",          live: true },
    { id: "comm",       ic: "🛢️", label: "원자재",           live: true },
    { id: "crypto",     ic: "₿",  label: "크립토",           live: true },
    { id: "wb",         ic: "📉", label: "국채금리",         live: true },
    { id: "movers",     ic: "🚀", label: "MOVERS",          live: true },
    { id: "kodex",      ic: "🅚", label: "KODEX",           live: true },
    { id: "tiger",      ic: "🐯", label: "TIGER",           live: true },
    { id: "syleverage", ic: "✖️", label: "SY레버리지",       live: true },
    { id: "korea",      ic: "🇰🇷", label: "KOREA",           live: true },
    { id: "fundlab",    ic: "🧪", label: "헤지펀드",         live: true },
    { id: "superinv",   ic: "👑", label: "Named Investors", live: true },
    { id: "industry",   ic: "🏭", label: "INDUSTRY",        live: true },
  ]},
  { id: "macro", ic: "🌐", name: "MACRO", tabs: [
    { id: "eco",   ic: "📅", label: "경제캘린더",   live: true },
    { id: "macro", ic: "📐", label: "MACRO(FRED)", live: true },
  ]},
  { id: "news", ic: "📰", name: "NEWS", tabs: [
    { id: "top",       ic: "🗞️", label: "TOP 헤드라인", live: true },
    { id: "thebell",   ic: "🏦", label: "더벨 TheBell", live: true },
    { id: "stocknews", ic: "🔔", label: "종목뉴스",     live: true },
  ]},
  { id: "telegram", ic: "📨", name: "TELEGRAM", tabs: [
    { id: "tgsearch", ic: "🔍", label: "Search",                live: true },
    { id: "tgdeep",   ic: "📳", label: "Telegram Daily Report", live: true },
  ]},
  { id: "research", ic: "🔬", name: "RESEARCH", tabs: [
    { id: "brief",       ic: "📋", label: "BRIEF",               live: true },
    { id: "stockreport", ic: "📄", label: "STOCK REPORT",        live: true },
    { id: "author",      ic: "✍️", label: "STOCK REPORT AUTHOR", live: true },
    { id: "followup",    ic: "🏃", label: "FOLLOWUP",            live: true },
    { id: "duo",         ic: "👥", label: "DUO",                 live: true },
    { id: "expect",      ic: "🤔", label: "EXPECT",              live: true },
    { id: "comp",        ic: "📊", label: "COMP 비교",            live: true },
    { id: "graph",       ic: "🕸️", label: "hk_graph",            live: true },
    { id: "research",    ic: "📚", label: "RESEARCH",            live: true },
  ]},
  { id: "quant", ic: "🧮", name: "QUANT", tabs: [
    { id: "consensus", ic: "🪙", label: "컨센서스",         live: true },
    { id: "valuation", ic: "⚖️", label: "Valuation",       live: true },
    { id: "flows",     ic: "💧", label: "수급",             live: true },
    { id: "sector",    ic: "💹", label: "섹터수익률(beta)", live: true },
    { id: "indices",   ic: "📏", label: "지수 편입/편출",    live: true },
    { id: "usmacro",   ic: "🇺🇸", label: "미국 금리지표",     live: true },
    { id: "lowpbr",    ic: "💥", label: "촉매",             live: true },
    { id: "dividend",  ic: "💰", label: "배당주",           live: true },
  ]},
  { id: "disclosure", ic: "📑", name: "DISCLOSURE", tabs: [
    { id: "dart",      ic: "🎯", label: "DART 공시",       live: true },
    { id: "supply",    ic: "📦", label: "공급계약공시",     live: true },
    { id: "acq",       ic: "🏗️", label: "유형자산취득공시", live: true },
    { id: "mezzanine", ic: "🧬", label: "메자닌발행공시",   live: true },
    { id: "newfunds",  ic: "🆕", label: "신규펀드 설정",    live: true },
  ]},
  { id: "company", ic: "🏢", name: "COMPANY", tabs: [
    { id: "search", ic: "🔎", label: "회사검색",  live: true },
    { id: "earn",   ic: "📢", label: "EARN 일정", live: true },
  ]},
];
