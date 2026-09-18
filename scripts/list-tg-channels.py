#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""로그인된 세션으로 내가 구독/가입한 모든 채널·그룹을 나열한다.
실행: cd /Users/anda/anda_stock && .venv/bin/python scripts/list-tg-channels.py
(먼저 collect-telegram.py --login 으로 로그인돼 있어야 함)
"""
import os
import asyncio
from telethon import TelegramClient

_HERE = os.path.dirname(os.path.abspath(__file__))
for ln in open(os.path.join(_HERE, ".env"), encoding="utf-8"):
    ln = ln.strip()
    if "=" in ln and not ln.startswith("#"):
        k, v = ln.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

API_ID = int(os.environ.get("TG_API_ID", "0"))
API_HASH = os.environ.get("TG_API_HASH", "")
SESSION = os.path.join(_HERE, "tg_feed_session")


async def main():
    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    chans, groups = [], []
    async for d in client.iter_dialogs():
        e = d.entity
        uname = getattr(e, "username", None)
        broadcast = getattr(e, "broadcast", False)   # 채널(방송형)
        megagroup = getattr(e, "megagroup", False)   # 그룹
        tag = f"@{uname}" if uname else "(비공개)"
        row = (d.name or "(이름없음)", tag)
        if broadcast:
            chans.append(row)
        elif megagroup or d.is_group:
            groups.append(row)
    def dump(title, rows):
        print(f"\n===== {title} ({len(rows)}개) =====")
        for i, (name, tag) in enumerate(rows, 1):
            print(f"{i:3}. {name[:40]:40} {tag}")
    dump("📢 채널", chans)
    dump("👥 그룹", groups)
    print(f"\n총 채널 {len(chans)} · 그룹 {len(groups)}")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
