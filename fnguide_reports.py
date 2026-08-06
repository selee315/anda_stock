#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fnguide 리포트 수집기 (v3: 현재가·상승여력·섹터 보강) — PDF 불필요
==================================================================
ReportsSummary에서 종목·제목·요약·애널리스트·증권사·투자의견·목표주가·TP상향/하향을 추출하고,
dart_tool(종목코드) + kis_tool(현재가·업종)로 현재가·상승여력·섹터를 붙여 섹터별로 정리한다.

[설치]  playwright(시스템 크롬), python3-bs4
[자격]  .env 의 FNGUIDE_ID/PW, DART_API_KEY, KIS_APP_KEY/SECRET
[사용]
  python3 fnguide_reports.py               # 로그인→수집→현재가/섹터 보강
  python3 fnguide_reports.py --offline      # 저장 HTML 파싱(현재가는 KIS 라이브)
  python3 fnguide_reports.py --no-enrich     # 현재가/섹터 보강 생략(빠름)
"""

import os
import re
import sys
import json
import time
import argparse
import datetime as dt
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
DATA_DIR = os.path.join(HERE, "data")
LOGIN = "https://www.fnguide.com/Users/Login"
SUMMARY_URL = "https://www.fnguide.com/Research/ReportsSummary"
OFFLINE_FILE = "fnguide_ReportsSummary.html"
VIEWER = "https://www.fnguide.com/Research/PdfViewer?rptId="

OPINION_SET = {"BUY", "매수", "매도", "중립", "HOLD", "OUTPERFORM", "OVERWEIGHT",
               "NEUTRAL", "MARKETPERFORM", "REDUCE", "SELL", "NR", "TRADINGBUY",
               "STRONGBUY", "강력매수", "적극매수"}
HOUSE_RE = re.compile(r"(증권|투자증권|자산운용|파인더|협의회|리서치|IR|證)")
NO_SECTOR = "해외·전략·시황"


# ---------------- 파싱 ----------------

def clean_name(t):
    t = re.sub(r"\s+", " ", t or "").strip()
    for cut in ["리포트 더보기", "리포트더보기", "컨센서스", "기업정보"]:
        if cut in t:
            t = t.split(cut)[0].strip()
    return t


def is_english(t):
    letters = re.findall(r"[A-Za-z가-힣]", t or "")
    if not letters:
        return False
    return sum(1 for c in letters if c.isascii()) / len(letters) > 0.6


def rows_with_rptid(html):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    for tr in soup.find_all("tr"):
        a = tr.find("a", href=re.compile(r"PdfViewer\?rptId=(\d+)"))
        if not a:
            continue
        rid = re.search(r"rptId=(\d+)", a["href"]).group(1)
        tds = tr.find_all("td")
        cells = [re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip() for td in tds]
        trs = str(tr)
        # 종목 버튼(data-type=1)의 6자리 코드 우선, 없으면 로고 svg
        bm = re.search(r'data-type="1"[^>]*data-value="(\d{6})"', trs)
        cm = re.search(r"Logo/domestic/svg/(\d{6})\.svg", trs)
        fcode = bm.group(1) if bm else (cm.group(1) if cm else "")
        yield rid, cells, fcode


def find_opinion(cells):
    for cell in cells:
        op = re.sub(r"(equal|increase|decrease)", " ", cell)
        op = re.sub(r"[\d,]+", " ", op)
        op = re.sub(r"\s+", " ", op).strip()
        if op and op.upper().replace(" ", "") in OPINION_SET:
            return op
    return ""


def find_tp(cells):
    for cell in cells:
        if re.search(r"(increase|decrease|equal)", cell) and re.search(r"\d[\d,]{3,}", cell):
            tp = re.search(r"(\d[\d,]{3,})", cell).group(1)
            dirn = "상향" if "increase" in cell else "하향" if "decrease" in cell else "유지"
            return tp, dirn
    for cell in cells[4:]:
        m = re.search(r"^\D*(\d[\d,]{3,})\D*$", cell)
        if m:
            return m.group(1), "유지"
    return "", "유지"


def find_house_analyst(cells):
    for i, cell in enumerate(cells):
        if i >= 3 and HOUSE_RE.search(cell) and not re.search(r"\d{4,}", cell) and len(cell) <= 20:
            for j in range(i - 1, 2, -1):
                cand = cells[j].strip()
                if cand and len(cand) <= 20 and not HOUSE_RE.search(cand) and not re.search(r"\d{4,}", cand):
                    return cell, cand
            return cell, ""
    return "", ""


def parse_summary(html):
    out, seen = [], set()
    for rid, c, fcode in rows_with_rptid(html):
        if len(c) < 4 or rid in seen:
            continue
        seen.add(rid)          # 여러 페이지 누적 시 중복 제거
        house, analyst = find_house_analyst(c)
        tp, tp_dir = find_tp(c)
        out.append({
            "rptId": rid, "name": clean_name(c[0]), "fcode": fcode,
            "title": c[1] if len(c) > 1 else "", "summary": c[2] if len(c) > 2 else "",
            "analyst": analyst, "house": house, "opinion": find_opinion(c),
            "tp": tp, "tp_dir": tp_dir, "url": VIEWER + rid,
            "code": "", "price": "", "sector": "", "upside": None,
            "is_en": is_english(c[1] if len(c) > 1 else ""),
        })
    return out


# ---------------- 현재가·섹터 보강 ----------------

def _num(s):
    try:
        return float(str(s).replace(",", ""))
    except (ValueError, TypeError):
        return None


def enrich(reports):
    try:
        import dart_tool
        import kis_tool
    except Exception as e:
        print("[안내] 보강 생략 (dart_tool/kis_tool 임포트 실패: %s)" % e)
        return
    try:
        dkey = dart_tool.load_api_key()
        corps = dart_tool.load_corp_codes(dkey)
        def _norm(s):
            return re.sub(r"[\s()㈜]|\(주\)|주식회사", "", s or "")
        name2code, norm2code = {}, {}
        for c in corps:
            sc = c.get("stock_code")
            nm = c.get("corp_name")
            if sc and nm:
                name2code.setdefault(nm, sc)
                norm2code.setdefault(_norm(nm), sc)
        app, sec, env, base = kis_tool.load_env()
        token = kis_tool.get_token(app, sec, base)
    except SystemExit:
        print("[안내] 보강 생략 (DART/KIS 키 확인 필요)")
        return

    for r in reports:
        # fnguide 로고에서 뽑은 코드 우선, 없으면 DART 이름매칭
        code = r.get("fcode") or name2code.get(r["name"]) or norm2code.get(_norm(r["name"]))
        if not code:
            continue
        try:
            o = kis_tool.inquire_price(code, app, sec, base, token)
        except SystemExit:
            continue
        r["code"] = code
        r["price"] = o.get("stck_prpr", "")
        r["sector"] = o.get("bstp_kor_isnm", "")
        tp, pr = _num(r["tp"]), _num(r["price"])
        if tp and pr:
            r["upside"] = (tp / pr - 1) * 100
        time.sleep(0.1)


# ---------------- 로그인/수집 ----------------

def load_creds():
    cfg = {}
    if os.path.exists(ENV_PATH):
        for line in open(ENV_PATH, encoding="utf-8"):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    uid = os.environ.get("FNGUIDE_ID") or cfg.get("FNGUIDE_ID", "")
    upw = os.environ.get("FNGUIDE_PW") or cfg.get("FNGUIDE_PW", "")
    if not uid or not upw:
        sys.exit("[오류] .env 에 FNGUIDE_ID / FNGUIDE_PW 가 없습니다.")
    return uid, upw


def fetch_summary_html():
    uid, upw = load_creds()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        exe = os.environ.get("CHROME_PATH", "")
        attempts = ([{"executable_path": exe}] if exe else []) + \
                   [{"channel": "chrome"}, {"channel": "chromium"}, {}]
        browser = None
        for kw in attempts:
            try:
                browser = pw.chromium.launch(headless=True, args=["--no-sandbox"], **kw)
                break
            except Exception:
                continue
        if browser is None:
            sys.exit("[오류] 브라우저 실행 실패 (크롬 설치 확인)")
        ctx = browser.new_context(locale="ko-KR",
              user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"))
        ctx.set_default_timeout(15000)
        page = ctx.new_page()
        page.on("dialog", lambda d: d.accept())
        page.goto(LOGIN, wait_until="domcontentloaded", timeout=30000)
        page.fill("input[name='userId']", uid)
        page.fill("input[name='userPw']", upw)
        for sel in ["#btnLogin", "button:has-text('로그인')", "input[type=submit]"]:
            try:
                if page.locator(sel).count() > 0:
                    page.locator(sel).first.click(timeout=2500)
                    break
            except Exception:
                continue
        page.wait_for_timeout(3500)
        for sel in ["button:has-text('확인')", ".btn_confirm"]:
            try:
                if page.locator(sel).count() > 0:
                    page.locator(sel).first.click(timeout=2000)
                    break
            except Exception:
                continue
        page.wait_for_timeout(2000)
        if "/Users/Login" in page.url:
            browser.close()
            sys.exit("[오류] 로그인 실패")
        page.goto(SUMMARY_URL, wait_until="domcontentloaded", timeout=30000)
        # 리스트는 JS로 렌더 → 행이 나타나고 '개수가 안정될 때'까지 대기(렌더 레이스 방지)
        try:
            page.wait_for_selector("a.report-title", timeout=20000)
        except Exception:
            pass
        prev, stable = -1, 0
        for _ in range(20):
            page.wait_for_timeout(1000)
            cnt = page.locator("a.report-title").count()
            if cnt > 0 and cnt == prev:
                stable += 1
                if stable >= 2:      # 2초 연속 동일 → 렌더 완료로 간주
                    break
            else:
                stable = 0
            prev = cnt
        print("[fnguide] 렌더된 리포트 행 %d개" % prev, flush=True)

        # 페이지네이션이 있으면 순회하며 누적(없으면 1페이지로 끝 — 안전)
        htmls = [page.content()]
        for _ in range(30):
            nxt = page.locator(
                "a.paging-next, .paging a.next, .pagination a.next, "
                "a[aria-label='다음'], a[title='다음'], .paginate_button.next")
            try:
                if nxt.count() == 0:
                    break
                cls = (nxt.first.get_attribute("class") or "")
                if "disabled" in cls or not nxt.first.is_enabled():
                    break
                nxt.first.click(timeout=3000)
            except Exception:
                break
            page.wait_for_timeout(1500)
            htmls.append(page.content())
        html = "\n".join(htmls)
        browser.close()
    return html


# ---------------- 출력 ----------------

def fmt_upside(r):
    if r.get("upside") is None:
        return ""
    return " / 현재 %s (%+.1f%%)" % (r.get("price") or "-", r["upside"])


def main():
    p = argparse.ArgumentParser(description="fnguide 리포트 수집(의견·TP·현재가·섹터)")
    p.add_argument("--offline", action="store_true", help="저장 HTML 파싱")
    p.add_argument("--no-enrich", action="store_true", help="현재가/섹터 보강 생략")
    p.add_argument("--no-pdf", action="store_true", help="PDF 본문 추출 생략")
    p.add_argument("--max-pdf", type=int, default=0, help="PDF 추출 최대 건수 (0=무제한 전체)")
    args = p.parse_args()

    if args.offline:
        if not os.path.exists(OFFLINE_FILE):
            sys.exit("[오류] %s 없음 (먼저 fnguide_explore.py 실행)" % OFFLINE_FILE)
        html = open(OFFLINE_FILE, encoding="utf-8").read()
    else:
        try:
            import playwright  # noqa
        except ImportError:
            sys.exit("[오류] playwright 미설치")
        html = fetch_summary_html()

    reports = parse_summary(html)
    m = re.search(r"리포트\s*([\d,]+)\s*개", html)   # 페이지 표기치와 파싱치 비교(누락 감지)
    if m:
        shown = int(m.group(1).replace(",", ""))
        flag = "" if shown <= len(reports) + 2 else "  ⚠ 누락 의심(페이지 확인 필요)"
        print("[fnguide] 페이지 표기 %d개 / 파싱 %d건%s" % (shown, len(reports), flag), flush=True)
    # 영문 리포트(국내 종목의 영어 중복본)는 제외 — 한글본만 사용
    before = len(reports)
    reports = [r for r in reports if not r.get("is_en")]
    if before != len(reports):
        print("영문 리포트 %d건 제외 (한글본만 유지)" % (before - len(reports)), flush=True)
    if not args.no_enrich:
        enrich(reports)

    # PDF 본문 추출 (주요 기업 리포트: 코드/TP 있고 영어 아님)
    if not args.no_pdf:
        try:
            import fnguide_pdf
            # 목표주가 변동(▲▼) 리포트를 우선 추출, 그다음 나머지
            major = [r["rptId"] for r in reports if not r.get("is_en") and r.get("tp_dir") in ("상향", "하향")]
            rest = [r["rptId"] for r in reports if not r.get("is_en") and r.get("tp_dir") not in ("상향", "하향")]
            key = major + rest
            mx = args.max_pdf if args.max_pdf and args.max_pdf > 0 else len(key)  # 0=전체
            print("PDF 본문 추출 대상 %d건 (상한 %s) ..." % (
                len(key), args.max_pdf if args.max_pdf > 0 else "무제한"), flush=True)
            texts = fnguide_pdf.extract(key, max_n=mx)
            for r in reports:
                r["body"] = texts.get(r["rptId"], "")
        except Exception as e:
            print("[안내] PDF 본문 추출 생략: %s" % str(e)[:100])

    today = dt.date.today().strftime("%Y-%m-%d")
    print("# fnguide 아침 리포트 — 총 %d건 (%s)" % (len(reports), today))

    # 목표주가 변동
    changed = [r for r in reports if r["tp_dir"] in ("상향", "하향")]
    print("\n[목표주가 변동 %d건]" % len(changed))
    for r in changed:
        arrow = "▲" if r["tp_dir"] == "상향" else "▼"
        print("  %s %s (%s %s) %s  TP %s%s" %
              (arrow, r["name"], r["house"], r["analyst"], r["opinion"] or "-",
               r["tp"], fmt_upside(r)))

    # 섹터별
    groups = defaultdict(list)
    for r in reports:
        groups[r.get("sector") or NO_SECTOR].append(r)
    keys = sorted([k for k in groups if k != NO_SECTOR]) + \
           ([NO_SECTOR] if NO_SECTOR in groups else [])
    print("\n[섹터별]")
    for k in keys:
        print("\n■ %s (%d건)" % (k, len(groups[k])))
        for r in groups[k]:
            tpinfo = ("의견 %s · TP %s%s" % (r["opinion"] or "-", r["tp"], fmt_upside(r))
                      if r["tp"] else "")
            mark = {"상향": " ▲", "하향": " ▼"}.get(r["tp_dir"], "")
            print("  · %s (%s %s)%s %s" %
                  (r["name"], r["house"], r["analyst"], mark,
                   ("— " + tpinfo) if tpinfo else ("— " + r["title"][:40])))

    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "reports_%s.json" % dt.date.today().strftime("%Y%m%d"))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(reports, f, ensure_ascii=False, indent=2)
    print("\n저장: %s" % path)


if __name__ == "__main__":
    main()
