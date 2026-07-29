# -*- coding: utf-8 -*-
"""
WiseReport 리서치 리포트 자동 수집기
------------------------------------
회사 ID/PW 로 로그인 후 ReportList.aspx 에서 개별 종목 리포트 메타데이터 추출.
FNGuide 보다 풍부 — 투자의견, 목표가, EPS 상향/하향 모두 명시되어 있음.

  python3 wisereport_scraper.py
  python3 wisereport_scraper.py --debug

결과: data/reports/YYYY-MM-DD.json
"""

import os
import sys
import json
import time
import re
import datetime as dt
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
REPORTS_DIR = os.path.join(DATA_DIR, "reports")
ENV_PATH = os.path.join(BASE_DIR, ".env")

LOGIN_BASE = "https://www.wisereport.co.kr"
REPORT_URL = "https://www.wisereport.co.kr/wiseReport/reports/ReportList.aspx"


def load_env(path=ENV_PATH):
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _login(page, user_id, user_pw):
    """WiseReport 로그인. ID/PW + 중복 로그인 다이얼로그 확인.

    페이지가 placeholder text input + 숨은 password input 패턴이라
    password 는 evaluate 로 값 직접 설정.
    """
    page.goto(LOGIN_BASE, wait_until="domcontentloaded", timeout=30000)
    time.sleep(1)
    page.click("#UsrID"); page.type("#UsrID", user_id, delay=70)
    page.click("#UsrPassWD_Text"); time.sleep(0.3)
    # 진짜 password input(#UsrPassWD) 은 hidden 이므로 값 직접 주입
    page.evaluate(f"document.getElementById('UsrPassWD').value='{user_pw}';")
    page.click("#btnLogin")
    time.sleep(3)
    # 중복 로그인 알림(#popup_ok)
    try:
        page.click("#popup_ok", timeout=4000)
        print("[wisereport] 중복 로그인 알림 → '확인' 클릭")
        time.sleep(3)
    except Exception:
        pass


def _parse_reports_table(html, today_only=True):
    """ReportList.aspx 의 리포트 테이블(table[7]) 파싱."""
    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    # 헤더가 "일자/제목/작성자/제공처/투자의견..." 인 테이블 찾기
    target = None
    for t in tables:
        hdr = t.find("tr")
        if not hdr:
            continue
        cells = [c.get_text(strip=True) for c in hdr.find_all(["th", "td"])]
        if "투자의견" in cells and "목표가" in cells:
            target = t
            break
    if target is None:
        return []

    today_str = dt.date.today().strftime("%y/%m/%d")
    out = []
    rows = target.find_all("tr")
    for r in rows[1:]:  # 0번은 헤더
        cells = r.find_all(["td", "th"])
        if len(cells) < 9:
            continue

        # C0 일자 — 셀에 '최초등록일시(regdt)' 와 '리스트 노출일' 두 날짜가 함께 온다.
        # 보통 둘이 같지만, 과거 등록됐다 오늘 다시 노출된 코멘트성 리포트는
        # regdt(앞)와 노출일(뒤)이 다르다. 오늘자 필터는 '노출일'(마지막 날짜) 기준이어야 한다.
        date_raw = cells[0].get_text(" ", strip=True)
        dates = re.findall(r"\d{2}/\d{2}/\d{2}", date_raw)
        if not dates:
            continue
        date_short = dates[-1]
        tm = re.search(r"\d{2}:\d{2}", date_raw)
        time_str = tm.group(0) if tm else ""
        if today_only and date_short != today_str:
            continue

        # C1 제목 — "[종목명]내용" 패턴
        title_raw = cells[1].get_text(strip=True)
        stock_name, title = _split_title(title_raw)
        # 리포트 ID 추출 — openContent(ID, brkId, ...)
        title_link = cells[1].find("a")
        rpt_id, broker_id = None, None
        if title_link:
            href = title_link.get("href", "")
            mm = re.search(r"openContent\((\d+),(\d+)", href)
            if mm:
                rpt_id, broker_id = mm.group(1), mm.group(2)

        analyst = cells[2].get_text(strip=True)
        broker = cells[3].get_text(strip=True)
        opinion = cells[4].get_text(strip=True) or None

        # C5 EPS + 상향/하향 아이콘
        eps_txt = cells[5].get_text(strip=True)
        eps = _parse_int(eps_txt)
        eps_img = cells[5].find("img")
        eps_change = None
        if eps_img:
            alt = eps_img.get("alt", "")
            if "상향" in alt:
                eps_change = "상향"
            elif "하향" in alt:
                eps_change = "하향"

        # C6: 목표가 + 변동 표시 (div.float-left 의 title 속성에 '목표주가 상향/하향' 또는 '변동없음')
        tp_cell = cells[6]
        target_price = _parse_int(tp_cell.get_text(strip=True))
        target_change = None
        tp_marker = tp_cell.find("div", class_=lambda c: c and "float-left" in c)
        if tp_marker:
            ttl = (tp_marker.get("title") or "").strip()
            if "상향" in ttl:
                target_change = "상향"
            elif "하향" in ttl:
                target_change = "하향"
            elif "변동없음" in ttl or "유지" in ttl:
                target_change = "유지"

        prev_close = _parse_int(cells[7].get_text(strip=True))
        pages = cells[8].get_text(strip=True).split()[0] if cells[8].get_text(strip=True) else ""

        # 종목코드 — C7(전일종가)의 차트 링크에 cmp_cd 가 있음 (3자리만 옴 → 6자리 필요시 마스터에서 매칭)
        stock_code = None
        for cell in (cells[6], cells[7]):
            a = cell.find("a")
            if a and "cmp_cd=" in a.get("href", ""):
                mm = re.search(r"cmp_cd=(\d+)", a.get("href"))
                if mm:
                    stock_code = mm.group(1).zfill(6)
                    break

        # 목표가 vs 전일종가 → 업사이드 계산
        upside = None
        if target_price and prev_close and prev_close > 0:
            upside = round((target_price - prev_close) / prev_close * 100, 2)

        out.append({
            "date": "20" + date_short.replace("/", "-"),
            "time": time_str,
            "rpt_id": rpt_id,
            "broker_id": broker_id,
            "stock_name": stock_name,
            "stock_code": stock_code,
            "title": title,
            "analyst": analyst,
            "broker": broker,
            "opinion": opinion,
            "target_price": target_price,
            "target_change": target_change,  # 상향/유지/하향/None
            "prev_close": prev_close,
            "upside_pct": upside,
            "eps": eps,
            "eps_change": eps_change,  # 상향/하향/None
            "pages": pages,
            # WiseReport 원문 링크 (메인 페이지로 — 사용자가 직접 검색)
            "source_url": REPORT_URL,
        })
    return out


def _split_title(raw):
    """`[종목명]내용` → (종목명, 내용)."""
    m = re.match(r"\[([^\]]+)\]\s*(.*)", raw)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return "", raw.strip()


def _parse_int(s):
    """'320,000' → 320000. 빈값/잘못된 값은 None."""
    s = (s or "").strip().replace(",", "")
    if not s or s in ("-",):
        return None
    try:
        return int(s)
    except ValueError:
        try:
            return int(float(s))
        except ValueError:
            return None


def fetch(debug=False, today_only=True):
    load_env()
    user_id = os.environ.get("WISEREPORT_ID")
    user_pw = os.environ.get("WISEREPORT_PW")
    if not (user_id and user_pw):
        raise SystemExit("ERROR: .env 에 WISEREPORT_ID / WISEREPORT_PW 가 필요합니다")
    os.makedirs(REPORTS_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36",
            locale="ko-KR", timezone_id="Asia/Seoul",
            viewport={"width": 1440, "height": 900},
        )
        ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'languages', {get: () => ['ko-KR','ko','en-US','en']});
        """)
        page = ctx.new_page()

        print(f"[wisereport] 로그인... ({user_id[:3]}***)")
        _login(page, user_id, user_pw)
        print(f"[wisereport] 로그인 후 URL: {page.url}")

        print(f"[wisereport] 리포트 페이지 진입...")
        page.goto(REPORT_URL, wait_until="networkidle", timeout=30000)
        time.sleep(2)
        html = page.content()
        if debug:
            with open(os.path.join(DATA_DIR, "_wisereport_list.html"), "w", encoding="utf-8") as f:
                f.write(html)

        reports = _parse_reports_table(html, today_only=today_only)
        print(f"[wisereport] 오늘자 리포트 {len(reports)}건 추출")
        browser.close()

    today = dt.date.today().strftime("%Y-%m-%d")
    out_path = os.path.join(REPORTS_DIR, f"{today}.json")
    payload = {
        "as_of": today,
        "fetched_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": "wisereport",
        "count": len(reports),
        "reports": reports,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[wisereport] 저장: {out_path}")

    # 요약 출력
    for r in reports[:8]:
        tp = f"{r['target_price']:,}" if r['target_price'] else "-"
        up = f"{r['upside_pct']:+.1f}%" if r['upside_pct'] is not None else "-"
        ec = f"EPS{r['eps_change']}" if r['eps_change'] else ""
        print(f"  {r['stock_name']:<15} {r['broker']:<6} {r['analyst']:<5} "
              f"{r['opinion'] or '-':<6} 목표 {tp:>8} ({up:>7}) {ec}")
    return payload


if __name__ == "__main__":
    debug = "--debug" in sys.argv
    today_only = "--all" not in sys.argv  # 기본 오늘만, --all 시 전체
    fetch(debug=debug, today_only=today_only)
