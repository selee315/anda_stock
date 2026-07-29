# -*- coding: utf-8 -*-
"""
FNGuide 리서치 리포트 자동 수집기
---------------------------------
회사 ID/PW 로 로그인 후 일별 리서치 페이지에서 개별 종목 리포트 메타데이터 추출.

  python3 fnguide_scraper.py            # 오늘자 리포트 수집
  python3 fnguide_scraper.py --debug    # 페이지 HTML 도 함께 저장
  python3 fnguide_scraper.py --fetch-pdf  # 추가로 PDF 다운로드 + 본문 추출

결과: data/reports/YYYY-MM-DD.json (메타) + data/reports/pdfs/RPTID.pdf
사용 ID/PW: 같은 폴더의 .env 파일 (.env.example 참고)
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
PDFS_DIR = os.path.join(REPORTS_DIR, "pdfs")
ENV_PATH = os.path.join(BASE_DIR, ".env")

LOGIN_URL = "https://www.fnguide.com/Users/Login"
REPORT_URL = "https://www.fnguide.com/Research/SearchReport"

# 개별 종목 data-type 만 채택 (1: 국내, 101: 해외)
STOCK_TYPES = ("1", "101")


def load_env(path=ENV_PATH):
    """간단 .env 파서. KEY=VALUE 형식."""
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
    """FNGuide 로그인. 봇 감지 우회 + 중복 로그인 다이얼로그 자동 확인."""
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
    time.sleep(0.5)
    page.click("#userId"); page.type("#userId", user_id, delay=60)
    page.click("#userPw"); page.type("#userPw", user_pw, delay=60)
    time.sleep(0.3)
    page.click("#loginBtn")

    # 중복 로그인 알림 (jQuery UI 다이얼로그) — "확인" 자동 클릭
    # 셀렉터: button.ui-button 안에 '확인' 텍스트 (메인 로그인 버튼과 구분)
    try:
        confirm = page.locator("button.ui-button:has-text('확인')")
        confirm.wait_for(state="visible", timeout=5000)
        print("[fnguide] 중복 로그인 알림 → '확인' 클릭 (강제 로그인)")
        confirm.click()
        time.sleep(3)  # 다이얼로그 → 강제 로그인 처리 대기
    except Exception:
        pass

    # networkidle 대기 (최대 15초). 페이지가 메인으로 이동했는지 확인
    try:
        page.wait_for_url(lambda u: "/Users/Login" not in u, timeout=15000)
    except Exception:
        pass  # URL 체크는 호출자에서 다시


def _parse_reports_table(html):
    """리서치 페이지 HTML 에서 리포트 목록 추출. 개별 종목만 (data-type 1/101)."""
    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    if len(tables) < 2:
        return []
    table = tables[1]
    out = []
    for r in table.find_all("tr"):
        cells = r.find_all(["td", "th"])
        if len(cells) < 6:
            continue

        # C1 종목/분류 (data-type 으로 필터)
        cat_btn = cells[1].find("button", class_="addInfoBtn")
        if not cat_btn:
            continue
        cat_type = cat_btn.get("data-type")
        if cat_type not in STOCK_TYPES:
            continue  # 시황/전략/산업 제외

        # C0 작성일 (예: "26.06.25")
        date_str = cells[0].get_text(" ", strip=True).split()[0]

        # C2 제목 + rptId
        title_a = cells[2].find("a", class_="report-title")
        if not title_a:
            continue
        title = title_a.get("title") or title_a.get_text(strip=True)
        rpt_id = title_a.get("data-value")
        pdf_url = title_a.get("href") or ""
        if pdf_url.startswith("/"):
            pdf_url = "https://www.fnguide.com" + pdf_url

        # C3 애널, C4 증권사
        anal_btn = cells[3].find("button", class_="addInfoBtn")
        analyst = anal_btn.get("data-name") if anal_btn else ""
        co_btn = cells[4].find("button", class_="addInfoBtn")
        broker = co_btn.get("data-name") if co_btn else ""

        pages = cells[5].get_text(strip=True)

        out.append({
            "date": date_str,
            "rpt_id": rpt_id,
            "title": title,
            "stock_code": cat_btn.get("data-value"),
            "stock_name": cat_btn.get("data-name"),
            "is_domestic": cat_type == "1",
            "analyst": analyst,
            "broker": broker,
            "pages": pages,
            "pdf_url": pdf_url,
            # 다음 단계에서 채울 필드들
            "target_price": None,
            "opinion": None,
            "target_change": None,  # 상향/하향/유지
            "summary": None,
        })
    return out


def fetch(debug=False, fetch_pdf=False):
    """오늘자 리서치 리포트 메타데이터 수집."""
    load_env()
    user_id = os.environ.get("FNGUIDE_ID")
    user_pw = os.environ.get("FNGUIDE_PW")
    if not (user_id and user_pw):
        raise SystemExit("ERROR: .env 에 FNGUIDE_ID / FNGUIDE_PW 가 필요합니다")

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
            Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
        """)
        page = ctx.new_page()

        print(f"[fnguide] 로그인... ({user_id[:3]}***)")
        _login(page, user_id, user_pw)
        if "/Users/Login" in page.url:
            html = page.content()
            if debug:
                with open(os.path.join(DATA_DIR, "_fnguide_login_debug.html"), "w", encoding="utf-8") as f:
                    f.write(html)
            browser.close()
            raise SystemExit("로그인 실패. ID/PW 확인 필요.")

        print(f"[fnguide] 로그인 성공 → 리서치 페이지 진입")
        page.goto(REPORT_URL, wait_until="networkidle", timeout=30000)
        html = page.content()
        if debug:
            with open(os.path.join(DATA_DIR, "_fnguide_report_debug.html"), "w", encoding="utf-8") as f:
                f.write(html)

        reports = _parse_reports_table(html)
        print(f"[fnguide] 개별 종목 리포트 {len(reports)}건 추출")

        # 추가 단계: PDF 다운로드 + 본문 분석 (옵션)
        if fetch_pdf and reports:
            os.makedirs(PDFS_DIR, exist_ok=True)
            print(f"[fnguide] PDF 다운로드 + 본문 분석...")
            for i, rep in enumerate(reports, 1):
                try:
                    _enrich_with_pdf(page, rep)
                    print(f"  ({i}/{len(reports)}) {rep['stock_name']} · {rep['broker']} · "
                          f"목표가 {rep.get('target_price')} · {rep.get('target_change')}")
                except Exception as e:
                    print(f"  ({i}/{len(reports)}) {rep['stock_name']} 실패: {e}")

        browser.close()

    # JSON 저장 (오늘 날짜)
    today = dt.date.today().strftime("%Y-%m-%d")
    out_path = os.path.join(REPORTS_DIR, f"{today}.json")
    payload = {
        "as_of": today,
        "fetched_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(reports),
        "reports": reports,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[fnguide] 저장 완료: {out_path}")
    return payload


# ---------------------------------------------------------------------------
# PDF 다운로드 + 본문 분석 (2단계, 옵션)
# ---------------------------------------------------------------------------
TARGET_PATTERNS = [
    r"목표\s*주가\s*[:\-]?\s*([\d,]+)\s*원",
    r"목표가\s*[:\-]?\s*([\d,]+)\s*원",
    r"적정\s*주가\s*[:\-]?\s*([\d,]+)\s*원",
    r"TP\s*[:\-]?\s*([\d,]+)\s*원",
    r"Target\s*Price\s*[:\-]?\s*([\d,]+)",
]
OPINION_KEYWORDS = ["BUY", "매수", "HOLD", "중립", "SELL", "매도",
                    "TRADING BUY", "STRONG BUY", "OUTPERFORM", "MARKETPERFORM"]


def _enrich_with_pdf(page, rep):
    """리포트 PDF 받아서 목표가/투자의견/요약 추출."""
    if not rep.get("pdf_url"):
        return
    pdf_path = os.path.join(PDFS_DIR, f"{rep['rpt_id']}.pdf")
    # 캐시: 이미 받은 PDF 는 재사용
    if not os.path.isfile(pdf_path):
        # 같은 컨텍스트에서 다운로드 (쿠키 유지)
        resp = page.context.request.get(rep["pdf_url"])
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        with open(pdf_path, "wb") as f:
            f.write(resp.body())

    try:
        import fitz  # PyMuPDF
    except ImportError:
        return  # 미설치 시 메타만

    doc = fitz.open(pdf_path)
    text = ""
    for p in doc:
        text += p.get_text() + "\n"
    doc.close()

    # 목표가
    for pat in TARGET_PATTERNS:
        m = re.search(pat, text)
        if m:
            try:
                rep["target_price"] = int(m.group(1).replace(",", ""))
                break
            except ValueError:
                pass

    # 투자의견
    head = text[:2000].upper()
    for kw in OPINION_KEYWORDS:
        if kw in head:
            rep["opinion"] = kw
            break

    # 상향/하향/유지
    head_kr = text[:2000]
    for kw in ("상향", "하향", "유지", "신규"):
        if kw in head_kr:
            rep["target_change"] = kw
            break

    # 요약 — 첫 페이지의 일부 (앞 400자, 헤더 잡티 제거)
    cleaned = re.sub(r"\s+", " ", text[:1500]).strip()
    rep["summary"] = cleaned[:400]


if __name__ == "__main__":
    debug = "--debug" in sys.argv
    fetch_pdf = "--fetch-pdf" in sys.argv
    fetch(debug=debug, fetch_pdf=fetch_pdf)
