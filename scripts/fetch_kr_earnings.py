#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한국 기업 실적발표 일정 → Supabase calendar_events (country=KR, category=earnings)
소스: DART OpenAPI
  · 결산실적공시예고  → 실적발표 '예정일'(포워드)  [문서에서 예정일 파싱]
  · 영업(잠정)실적    → 실적 '발표된 날'(최근)       [rcept_dt]
필요 env: DART_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (scripts/.env)
실행: set -a; source scripts/.env; python3 scripts/fetch_kr_earnings.py  [--dry]
"""
import os, re, io, ssl, sys, json, time, zipfile, datetime as dt
import urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
def _env(k, d=""):
    v = os.environ.get(k)
    if v: return v
    p = os.path.join(HERE, ".env")
    if os.path.exists(p):
        for ln in open(p, encoding="utf-8"):
            ln=ln.strip()
            if ln.startswith(k+"="): return ln.split("=",1)[1].strip().strip('"').strip("'")
    return d
KEY=_env("DART_API_KEY"); SB=_env("SUPABASE_URL").rstrip("/"); SK=_env("SUPABASE_SERVICE_ROLE_KEY")
DRY="--dry" in sys.argv
try:
    import certifi; CTX=ssl.create_default_context(cafile=certifi.where())
except Exception: CTX=ssl.create_default_context()

def jget(url):
    return json.load(urllib.request.urlopen(url, timeout=25, context=CTX))

def dart_list(bgn, end, want):
    """기간 내 공시 중 report_nm 에 want 포함된 것들."""
    out=[]
    for pg in range(1, 11):
        url=(f"https://opendart.fss.or.kr/api/list.json?crtfc_key={KEY}"
             f"&bgn_de={bgn}&end_de={end}&page_count=100&page_no={pg}")
        try: d=jget(url)
        except Exception: break
        if d.get("status")!="000": break
        for x in d.get("list",[]):
            if want in x.get("report_nm",""): out.append(x)
        if pg>=int(d.get("total_page",1)): break
    return out

_DATE=re.compile(r"(공시\s*예정일|실적\s*공시\s*예정일|예정일자?)[^\d]{0,12}(\d{4})[-./](\d{1,2})[-./](\d{1,2})")
def predicted_date(rcept_no):
    """결산실적공시예고 문서에서 실적 공시예정일 추출."""
    try:
        raw=urllib.request.urlopen(
            f"https://opendart.fss.or.kr/api/document.xml?crtfc_key={KEY}&rcept_no={rcept_no}",
            timeout=25, context=CTX).read()
        try:
            z=zipfile.ZipFile(io.BytesIO(raw)); txt=z.read(z.namelist()[0]).decode("utf-8","replace")
        except Exception:
            txt=raw.decode("utf-8","replace")
        txt=re.sub(r"<[^>]+>"," ",txt)
        m=_DATE.search(txt)
        if m:
            y,mo,da=int(m.group(2)),int(m.group(3)),int(m.group(4))
            return dt.date(y,mo,da).isoformat()
    except Exception:
        return None
    return None

def sb_upsert(rows):
    if not rows: return
    data=json.dumps(rows, ensure_ascii=False).encode("utf-8")
    req=urllib.request.Request(SB+"/rest/v1/calendar_events?on_conflict=uniq", data=data, method="POST",
        headers={"apikey":SK,"Authorization":"Bearer "+SK,"Content-Type":"application/json",
                 "Prefer":"resolution=merge-duplicates,return=minimal"})
    urllib.request.urlopen(req, timeout=40, context=CTX).read()

def main():
    today=dt.date.today()
    rows=[]; seen=set()
    def add(r):
        if r["uniq"] not in seen: seen.add(r["uniq"]); rows.append(r)

    # 1) 실적발표 예정(포워드) — 최근 21일 내 접수된 '결산실적공시예고'의 예정일
    bgn=(today-dt.timedelta(days=21)).strftime("%Y%m%d"); end=today.strftime("%Y%m%d")
    pre=dart_list(bgn, end, "실적공시예고")
    print(f"결산실적공시예고 {len(pre)}건 → 예정일 파싱…", flush=True)
    for i,x in enumerate(pre):
        pd=predicted_date(x["rcept_no"])
        corp=x.get("corp_name","").strip(); code=x.get("stock_code") or None
        if not pd: continue
        if pd < today.isoformat(): continue          # 지난 예정일은 제외
        add({"event_date":pd,"event_time":None,"country":"KR","category":"earnings",
             "title":f"{corp} 실적발표(예정)","ticker":code,"importance":2,
             "detail":{"type":"실적발표 예정","via":"DART 공시예고"},"source":"dart",
             "uniq":f"krearn|{pd}|{corp}"})
        time.sleep(0.12)
        if (i+1)%20==0: print(f"  ...{i+1}/{len(pre)}", flush=True)

    # 2) 최근 발표된 잠정실적 — 최근 5일
    bgn2=(today-dt.timedelta(days=5)).strftime("%Y%m%d")
    prov=dart_list(bgn2, end, "영업(잠정)실적")
    print(f"영업(잠정)실적 {len(prov)}건", flush=True)
    for x in prov:
        rd=x.get("rcept_dt","")
        if len(rd)==8: rd=f"{rd[:4]}-{rd[4:6]}-{rd[6:8]}"
        corp=x.get("corp_name","").strip(); code=x.get("stock_code") or None
        add({"event_date":rd,"event_time":None,"country":"KR","category":"earnings",
             "title":f"{corp} 잠정실적 발표","ticker":code,"importance":1,
             "detail":{"type":"잠정실적 발표","via":"DART"},"source":"dart",
             "uniq":f"krprov|{rd}|{corp}"})

    print(f"\n✓ 한국 실적 {len(rows)}건 (예정 {sum(1 for r in rows if '예정' in r['title'])} · 잠정 {sum(1 for r in rows if '잠정' in r['title'])})", flush=True)
    for r in sorted(rows, key=lambda r:r['event_date'])[:12]:
        print(f"   [{r['event_date']}] {r['title']}")
    if DRY: print("(--dry: 적재 생략)"); return
    for i in range(0,len(rows),500): sb_upsert(rows[i:i+500])
    print(f"✓ calendar_events 적재 {len(rows)}건", flush=True)

if __name__=="__main__":
    main()
