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

def dart_list(bgn, end, want, pblntf_ty="I", max_pages=70):
    """기간 내 공시 중 report_nm 에 want 포함된 것들.
    pblntf_ty='I'(거래소공시)로 좁혀 전수 수집(실적공시예고·영업잠정실적 모두 거래소공시)."""
    out=[]
    for pg in range(1, max_pages+1):
        ty = f"&pblntf_ty={pblntf_ty}" if pblntf_ty else ""
        url=(f"https://opendart.fss.or.kr/api/list.json?crtfc_key={KEY}"
             f"&bgn_de={bgn}&end_de={end}{ty}&page_count=100&page_no={pg}")
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

    # 확정/발표된 기업(예고·잠정) — 예상 추가 시 중복 방지용
    confirmed = set(r.get("ticker") or r["title"].split()[0] for r in rows)

    # 3) 향후 '예상' 실적발표 — 작년 같은 분기(동기) 발표일 +364일로 추정.
    #    (한국 기업은 1주 전에야 예고를 올려 확정분이 드물다 → 작년 기준 예상치로 향후 채움)
    anchor = today - dt.timedelta(days=364)              # 작년 같은 달력 위치
    # 향후로 매핑될 구간만: 작년 [anchor, anchor+56] 을 주 단위로 쪼개 전수 수집
    # (한 번에 긴 기간을 받으면 DART 페이지 한도로 누락 → 주별로 분할)
    seen_corp = {}
    wk = anchor
    while wk <= anchor + dt.timedelta(days=56):
        we = min(wk + dt.timedelta(days=6), anchor + dt.timedelta(days=56))
        chunk = dart_list(wk.strftime("%Y%m%d"), we.strftime("%Y%m%d"), "영업(잠정)실적")
        for x in chunk:
            corp = x.get("corp_name", "").strip(); code = x.get("stock_code") or None
            rd = x.get("rcept_dt", "")
            if corp and corp not in seen_corp and len(rd) == 8:
                seen_corp[corp] = (code, rd)
        wk = we + dt.timedelta(days=1)
    est_cnt = 0
    for corp, (code, rd) in seen_corp.items():
        if (code or corp) in confirmed:
            continue                                     # 이미 확정/발표분 있으면 예상 생략
        try:
            est = (dt.datetime.strptime(rd, "%Y%m%d").date() + dt.timedelta(days=364)).isoformat()
        except ValueError:
            continue
        if est < today.isoformat():
            continue                                     # 과거 추정일 제외
        add({"event_date": est, "event_time": None, "country": "KR", "category": "earnings",
             "title": f"{corp} 실적발표(예상)", "ticker": code, "importance": 1,
             "detail": {"type": "실적발표 예상(작년 동기 기준)", "via": "DART 추정"}, "source": "dart-est",
             "uniq": f"krest|{est}|{corp}"})
        est_cnt += 1
    print(f"작년 동기 {len(seen_corp)}개 → 향후 예상 {est_cnt}건 추가", flush=True)

    print(f"\n✓ 한국 실적 {len(rows)}건 (예정 {sum(1 for r in rows if '(예정)' in r['title'])} · 잠정 {sum(1 for r in rows if '잠정' in r['title'])} · 예상 {sum(1 for r in rows if '(예상)' in r['title'])})", flush=True)
    for r in sorted(rows, key=lambda r:r['event_date'])[:12]:
        print(f"   [{r['event_date']}] {r['title']}")
    if DRY: print("(--dry: 적재 생략)"); return
    for i in range(0,len(rows),500): sb_upsert(rows[i:i+500])
    print(f"✓ calendar_events 적재 {len(rows)}건", flush=True)

if __name__=="__main__":
    main()
