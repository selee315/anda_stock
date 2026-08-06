#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fnguide 리포트 → Supabase 동기화 (안다 리서치 포털용)
=====================================================
fnguide_reports 로 오늘 리포트 목록·의견·목표주가·상향하향 수집,
fnguide_pdf 로 '신규' 리포트만 본문 추출(중복 다운로드/스로틀 방지),
Naver 현재가로 상승여력 계산 후 public.reports 에 업서트.

[자격]  루트 .env: FNGUIDE_ID/PW  ·  scripts/.env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
[사용]
  python3 fnguide_sync.py                # 전체(신규 리포트 본문 추출)
  FNG_MAX_PDF=20 python3 fnguide_sync.py # 이번 실행 PDF 추출 최대 20건(TP변동 우선)
  python3 fnguide_sync.py --no-pdf       # 메타만(빠름)
"""
import os
import re
import sys
import json
import time
import datetime as dt
import ssl
import urllib.request
import urllib.parse

import fnguide_reports as FR
import fnguide_pdf

try:
    import certifi
    _SSL = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _SSL = ssl.create_default_context()

HERE = os.path.dirname(os.path.abspath(__file__))
KST = dt.timezone(dt.timedelta(hours=9))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
MAX_PDF = int(os.environ.get("FNG_MAX_PDF", "0"))   # 0 = 무제한


def _read_env(path):
    cfg = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


def load_supabase():
    cfg = _read_env(os.path.join(HERE, "scripts", ".env"))
    cfg.update({k: v for k, v in _read_env(os.path.join(HERE, ".env")).items() if k.startswith("SUPABASE")})
    url = os.environ.get("SUPABASE_URL") or cfg.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or cfg.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("[오류] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음 (scripts/.env 확인)")
    return url.rstrip("/"), key


def _num(s):
    try:
        return float(str(s).replace(",", ""))
    except (ValueError, TypeError):
        return None


def naver_price(code):
    try:
        req = urllib.request.Request(
            "https://m.stock.naver.com/api/stock/%s/basic" % code, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=10, context=_SSL) as r:
            j = json.load(r)
        return _num(j.get("closePrice"))
    except Exception:
        return None


def sb_get_bodies(url, key):
    """이미 본문이 있는 rptId 집합 (재추출 방지)."""
    out = set()
    try:
        req = urllib.request.Request(
            "%s/rest/v1/reports?select=rpt_id&body=not.is.null" % url,
            headers={"apikey": key, "Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=30, context=_SSL) as r:
            for row in json.load(r):
                out.add(row["rpt_id"])
    except Exception as e:
        print("[안내] 기존 본문 조회 실패(무시): %s" % str(e)[:80])
    return out


def sb_upsert(url, key, rows):
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        data = json.dumps(chunk, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            "%s/rest/v1/reports?on_conflict=rpt_id" % url, data=data, method="POST",
            headers={"apikey": key, "Authorization": "Bearer " + key,
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        try:
            urllib.request.urlopen(req, timeout=60, context=_SSL).read()
        except urllib.error.HTTPError as e:
            sys.exit("[오류] upsert 실패 %s: %s" % (e.code, e.read().decode("utf-8", "ignore")[:300]))


def main():
    no_pdf = "--no-pdf" in sys.argv
    url, key = load_supabase()
    today = dt.datetime.now(KST).strftime("%Y-%m-%d")

    print("[1/4] fnguide 리포트 수집...", flush=True)
    html = FR.fetch_summary_html()
    reports = [r for r in FR.parse_summary(html) if not r.get("is_en")]
    print("      %d건 (영문 제외)" % len(reports), flush=True)

    print("[2/4] 신규 리포트 본문(PDF) 추출...", flush=True)
    bodies = {}
    if not no_pdf:
        have = sb_get_bodies(url, key)
        # TP변동 우선 → 나머지. 이미 본문 있는 건 스킵.
        major = [r["rptId"] for r in reports if r["rptId"] not in have and r.get("tp_dir") in ("상향", "하향")]
        rest = [r["rptId"] for r in reports if r["rptId"] not in have and r.get("tp_dir") not in ("상향", "하향")]
        todo = major + rest
        if MAX_PDF > 0:
            todo = todo[:MAX_PDF]
        print("      기존본문 %d · 신규대상 %d%s" % (
            len(have), len(todo), (" (상한 %d)" % MAX_PDF) if MAX_PDF else ""), flush=True)
        if todo:
            bodies = fnguide_pdf.extract(todo, max_n=len(todo))

    print("[3/4] 현재가·상승여력(Naver) 보강...", flush=True)
    seen_price = {}
    for r in reports:
        code = r.get("fcode") or ""
        if re.fullmatch(r"\d{6}", code):
            if code not in seen_price:
                seen_price[code] = naver_price(code)
                time.sleep(0.05)
            r["price_num"] = seen_price[code]
        else:
            r["price_num"] = None

    rows = []
    for r in reports:
        tp = _num(r.get("tp"))
        cp = r.get("price_num")
        up = round((tp / cp - 1) * 100, 1) if (tp and cp) else None
        rows.append({
            "rpt_id": r["rptId"],
            "report_date": today,
            "stock_name": r.get("name") or None,
            "stock_code": (r.get("fcode") or None),
            "title": r.get("title") or None,
            "summary": r.get("summary") or None,
            "analyst": (r.get("analyst") or "").strip() or None,
            "house": (r.get("house") or "").strip() or None,
            "opinion": r.get("opinion") or None,
            "target_price": tp,
            "tp_dir": r.get("tp_dir") or None,
            "current_price": cp,
            "upside": up,
            "sector": r.get("sector") or None,
            "body": bodies.get(r["rptId"]) or None,   # 신규만 채움(기존 본문은 merge로 유지 X → 아래 보완)
            "url": r.get("url") or None,
        })

    # PostgREST 벌크 업서트는 한 요청 내 키가 모두 동일해야 함 → body 유무로 분리.
    # 본문 없는 행은 body 키 자체를 빼서 기존 본문을 null로 덮지 않게 함.
    with_body = [r for r in rows if r.get("body")]
    meta_only = [{k: v for k, v in r.items() if k != "body"} for r in rows if not r.get("body")]

    print("[4/4] Supabase 업서트 — 본문 %d · 메타 %d..." % (len(with_body), len(meta_only)), flush=True)
    if with_body:
        sb_upsert(url, key, with_body)
    if meta_only:
        sb_upsert(url, key, meta_only)
    changed = sum(1 for r in reports if r.get("tp_dir") in ("상향", "하향"))
    withbody = sum(1 for r in rows if r.get("body"))
    print("✓ 완료 — 총 %d건 · 목표주가변동 %d · 신규본문 %d (%s)" % (len(rows), changed, withbody, today))


if __name__ == "__main__":
    main()
