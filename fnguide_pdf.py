#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fnguide PDF 본문 추출기 — rptId 목록 → 리포트 본문 텍스트
=========================================================
로그인 후 각 rptId의 PdfViewer를 열어 GetPdfFile 응답(JSON dataSet, data URI base64)을
캡처·디코드해 PDF 본문 텍스트를 추출한다.

[설치]  playwright(시스템 크롬), python3 -m pip install pypdf --break-system-packages
[자격]  .env 의 FNGUIDE_ID / FNGUIDE_PW
[사용(단독 테스트)]  python3 fnguide_pdf.py 1107738 1107769
[모듈]  from fnguide_pdf import extract;  texts = extract(["1107738", ...], max_n=20)
"""

import os
import re
import io
import sys
import base64

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
LOGIN = "https://www.fnguide.com/Users/Login"
VIEWER = "https://www.fnguide.com/Research/PdfViewer?rptId="


def _creds():
    cfg = {}
    if os.path.exists(ENV_PATH):
        for line in open(ENV_PATH, encoding="utf-8"):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    return (os.environ.get("FNGUIDE_ID") or cfg.get("FNGUIDE_ID", ""),
            os.environ.get("FNGUIDE_PW") or cfg.get("FNGUIDE_PW", ""))


def _pdf_text(body_json_bytes):
    """GetPdfFile 응답(JSON {dataSet:data URI base64}) → PDF 본문 텍스트."""
    import json
    try:
        j = json.loads(body_json_bytes.decode("utf-8", "ignore"))
    except Exception:
        return ""
    ds = j.get("dataSet") or max((v for v in j.values() if isinstance(v, str)),
                                 key=len, default="")
    b64 = ds.split("base64,", 1)[1] if "base64," in ds else ds
    b64 = re.sub(r"\s", "", b64)
    try:
        dec = base64.b64decode(b64 + "=" * (-len(b64) % 4))
    except Exception:
        return ""
    si = dec.find(b"%PDF")
    if si < 0:
        return ""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(dec[si:]))
        return "\n".join((p.extract_text() or "") for p in reader.pages).strip()
    except Exception:
        return ""


def extract(rptids, max_n=20, log=print):
    """rptId 리스트 → {rptId: 본문텍스트}. 로그인 1회로 순차 처리."""
    rptids = [str(r) for r in rptids][:max_n]
    if not rptids:
        return {}
    uid, upw = _creds()
    if not uid or not upw:
        log("[PDF] FNGUIDE 자격 없음 → 건너뜀")
        return {}
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("[PDF] playwright 미설치 → 건너뜀")
        return {}

    out = {}
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
            log("[PDF] 브라우저 실행 실패 → 건너뜀")
            return {}
        ctx = browser.new_context(locale="ko-KR")
        page = ctx.new_page()
        page.on("dialog", lambda d: d.accept())
        holder = {"body": None}

        def on_resp(resp):
            if "GetPdfFile" in resp.url:
                try:
                    holder["body"] = resp.body()
                except Exception:
                    pass
        page.on("response", on_resp)

        # 로그인
        try:
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
            page.wait_for_timeout(1500)
        except Exception as e:
            log("[PDF] 로그인 오류: %s" % str(e)[:80])
            browser.close()
            return {}
        if "/Users/Login" in page.url:
            log("[PDF] 로그인 실패 → 건너뜀")
            browser.close()
            return {}

        for i, rid in enumerate(rptids, 1):
            holder["body"] = None
            try:
                page.goto(VIEWER + rid, wait_until="domcontentloaded", timeout=30000)
            except Exception:
                pass
            # GetPdfFile 응답 대기 (최대 ~9초)
            for _ in range(18):
                if holder["body"]:
                    break
                page.wait_for_timeout(500)
            txt = _pdf_text(holder["body"]) if holder["body"] else ""
            out[rid] = txt
            log("[PDF] (%d/%d) rptId=%s → %d자" % (i, len(rptids), rid, len(txt)))
        browser.close()
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit("사용: python3 fnguide_pdf.py rptId [rptId ...]")
    texts = extract(sys.argv[1:], max_n=len(sys.argv) - 1)
    for rid, t in texts.items():
        print("\n===== rptId %s (%d자) =====" % (rid, len(t)))
        print(t[:800])


if __name__ == "__main__":
    main()
