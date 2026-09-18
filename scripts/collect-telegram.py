#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
텔레그램 → market_feed 수집기
-----------------------------
지정한 채널들의 최근 메시지를 읽어 Supabase market_feed(source='telegram')로 upsert.
중요도는 score-feed.mjs 스코어러가 나중에 채운다.

필요 env (scripts/.env):
  TG_API_ID, TG_API_HASH   my.telegram.org 발급
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
대상 채널: scripts/tg_channels.txt (한 줄에 하나, @username 또는 t.me/... 또는 채널명/ID)
세션: scripts/tg_feed_session.session (최초 1회 로그인 시 생성)

실행:
  python scripts/collect-telegram.py          # 1회
  python scripts/collect-telegram.py --login   # 최초 로그인(전화번호/코드 입력)
"""
import os
import sys
import ssl
import json
import asyncio
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    import certifi
    _CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _CTX = ssl.create_default_context()

from telethon import TelegramClient

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load_env():
    p = os.path.join(_HERE, ".env")
    if os.path.exists(p):
        for ln in open(p, encoding="utf-8"):
            ln = ln.strip()
            if "=" in ln and not ln.startswith("#"):
                k, v = ln.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()
API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")
SB_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
SESSION = os.path.join(_HERE, "tg_feed_session")
CHANNELS_FILE = os.path.join(_HERE, "tg_channels.txt")

LOOKBACK_MIN = 90            # 최근 몇 분 메시지를 볼지
MAX_PER_CHAT = 80           # 채널당 최대 메시지
MIN_LEN = 8                 # 너무 짧은 메시지 무시


def load_channels():
    if not os.path.exists(CHANNELS_FILE):
        return []
    out = []
    for ln in open(CHANNELS_FILE, encoding="utf-8"):
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        ln = ln.replace("https://t.me/", "@").replace("t.me/", "@")
        out.append(ln)
    return out


def sb_upsert(rows):
    if not rows:
        return 0
    data = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        SB_URL + "/rest/v1/market_feed?on_conflict=source,external_id",
        data=data, method="POST",
        headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY,
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=30, context=_CTX) as resp:
        return resp.status


async def collect(client):
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MIN)
    channels = load_channels()
    if not channels:
        print(f"대상 채널이 없습니다. {CHANNELS_FILE} 에 채널을 추가하세요.")
        return
    print(f"📡 텔레그램 수집 — 채널 {len(channels)}개, 최근 {LOOKBACK_MIN}분")
    rows = []
    for ch in channels:
        try:
            entity = await client.get_entity(ch)
        except Exception as e:
            print(f"  ! {ch}: 접근 실패 ({str(e)[:50]})")
            continue
        name = getattr(entity, "title", None) or getattr(entity, "username", None) or str(ch)
        uname = getattr(entity, "username", None)
        n = 0
        async for m in client.iter_messages(entity, limit=MAX_PER_CHAT):
            if m.date < cutoff:
                break
            text = (m.text or "").strip()
            if len(text) < MIN_LEN:
                continue
            title = text.split("\n", 1)[0][:200]
            url = f"https://t.me/{uname}/{m.id}" if uname else None
            rows.append({
                "source": "telegram",
                "channel": name,
                "external_id": f"{entity.id}:{m.id}",
                "title": title,
                "body": text[:4000],
                "url": url,
                "published_at": m.date.astimezone(timezone.utc).isoformat(),
            })
            n += 1
        print(f"  ✓ {name[:24]:24} {n}건")
    # 200개씩 나눠 upsert
    total = 0
    for i in range(0, len(rows), 200):
        sb_upsert(rows[i:i + 200])
        total += len(rows[i:i + 200])
    print(f"✓ market_feed 저장 {total}건 (미채점)")


async def main():
    if not API_ID or not API_HASH:
        print("TG_API_ID / TG_API_HASH 가 .env 에 없습니다."); return
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()  # --login 최초 1회: 전화번호 + 인증코드 입력
    async with client:
        if "--login" in sys.argv:
            me = await client.get_me()
            print(f"✓ 로그인 완료: {getattr(me,'first_name','')} (@{getattr(me,'username','')})")
            return
        await collect(client)


if __name__ == "__main__":
    asyncio.run(main())
