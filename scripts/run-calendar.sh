#!/bin/zsh
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/anda/anda_stock
set -a; source scripts/.env; set +a
/Users/anda/.local/node/bin/node scripts/fetch-calendar.mjs
/Users/anda/projects/research-tools/.venv/bin/python scripts/fetch_kr_earnings.py
