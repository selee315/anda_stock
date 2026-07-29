// ─────────────────────────────────────────────────────────────
//  좌측 네비게이션 구조 (참고: research.ahfms.co.kr)
//  category = 최좌측 아이콘 레일, section = 두번째 컬럼 목록
//  각 section 은 아직 데이터가 없으므로 placeholder 로 렌더됩니다.
//  실제 데이터 연결 시 이 파일의 각 항목에 렌더러를 붙입니다.
// ─────────────────────────────────────────────────────────────
window.NAV = [
  {
    id: "market",
    label: "MARKET",
    icon: "📊",
    sections: [
      { id: "msci",     label: "MSCI",            icon: "🌐", live: true },
      { id: "wei",      label: "WEI 지수",         icon: "🌏", live: true },
      { id: "weif",     label: "WEIF 선물",        icon: "⚡", live: true },
      { id: "fx",       label: "FX 환율",          icon: "💱", live: true },
      { id: "commod",   label: "원자재",           icon: "🛢️", live: true },
      { id: "crypto",   label: "크립토",           icon: "₿",  live: true },
      { id: "rates",    label: "국채금리",         icon: "📈", live: true },
      { id: "movers",   label: "MOVERS",          icon: "🚀", live: true },
      { id: "kodex",    label: "KODEX",           icon: "🅚", live: true },
      { id: "tiger",    label: "TIGER",           icon: "🐯", live: true },
      { id: "sylev",    label: "SY레버리지",       icon: "✖️", live: true },
      { id: "korea",    label: "KOREA",           icon: "🇰🇷", live: true },
      { id: "hedge",    label: "헤지펀드",         icon: "🐋", live: true },
      { id: "named",    label: "Named Investors", icon: "👤", live: true },
      { id: "industry", label: "INDUSTRY",        icon: "🏭", live: true },
    ],
  },
  {
    id: "macro",
    label: "MACRO",
    icon: "🌐",
    sections: [
      { id: "econcal", label: "경제캘린더",   icon: "📅", live: true },
      { id: "fred",    label: "MACRO(FRED)", icon: "📉" },
    ],
  },
  {
    id: "news",
    label: "NEWS",
    icon: "📰",
    sections: [
      { id: "top",       label: "TOP 헤드라인", icon: "📌", live: true },
      { id: "thebell",   label: "더벨 TheBell", icon: "🔔", live: true },
      { id: "stocknews", label: "종목뉴스",     icon: "📊", live: true },
    ],
  },
  {
    id: "telegram",
    label: "TELEGRAM",
    icon: "✈️",
    sections: [
      { id: "tg-search", label: "Search",               icon: "🔍", live: true },
      { id: "tg-daily",  label: "Telegram Daily Report", icon: "📄", live: true },
    ],
  },
  {
    id: "research",
    label: "RESEARCH",
    icon: "🔬",
    sections: [
      { id: "brief",       label: "BRIEF",              icon: "✏️", live: true },
      { id: "stockrep",    label: "STOCK REPORT",       icon: "📑", live: true },
      { id: "stockauthor", label: "STOCK REPORT AUTHOR", icon: "✍️", live: true },
      { id: "followup",    label: "FOLLOWUP",           icon: "🔁", live: true },
      { id: "duo",         label: "DUO",                icon: "👥", live: true },
      { id: "expect",      label: "EXPECT",             icon: "🎯", live: true },
      { id: "comp",        label: "COMP 비교",           icon: "⚖️", live: true },
      { id: "hkgraph",     label: "hk_graph",           icon: "📈", live: true },
    ],
  },
  {
    id: "quant",
    label: "QUANT",
    icon: "🧮",
    sections: [
      { id: "consensus", label: "컨센서스",         icon: "🎯", live: true },
      { id: "valuation", label: "Valuation",       icon: "💧", live: true },
      { id: "flow",      label: "수급",             icon: "💧", live: true },
      { id: "sector",    label: "섹터수익률(beta)", icon: "🟩", live: true },
      { id: "inout",     label: "지수 편입/편출",    icon: "🔧", live: true },
      { id: "catalyst",  label: "촉매",             icon: "🧨", live: true },
      { id: "dividend",  label: "배당주",           icon: "💰", live: true },
    ],
  },
  {
    id: "disclosure",
    label: "DISCLOSURE",
    icon: "🏛️",
    sections: [
      { id: "dart",     label: "DART 공시",       icon: "📦", live: true },
      { id: "supply",   label: "공급계약공시",     icon: "📦", live: true },
      { id: "asset",    label: "유형자산취득공시", icon: "🏗️", live: true },
      { id: "mezz",     label: "메자닌발행공시",   icon: "📜", live: true },
      { id: "newfund",  label: "신규펀드 설정",    icon: "🆕", live: true },
    ],
  },
  {
    id: "company",
    label: "COMPANY",
    icon: "🏢",
    sections: [
      { id: "search", label: "회사검색",  icon: "🔍", live: true },
      { id: "earn",   label: "EARN 일정", icon: "📆", live: true },
    ],
  },
];
