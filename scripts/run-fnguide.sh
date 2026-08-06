#!/bin/zsh
# FnGuide 리포트 수집 → Supabase (하루 6회 launchd 호출)
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/anda/anda_stock
echo "===== $(date '+%Y-%m-%d %H:%M:%S') fnguide_sync 시작 ====="
exec /Users/anda/anda_stock/.venv/bin/python fnguide_sync.py
