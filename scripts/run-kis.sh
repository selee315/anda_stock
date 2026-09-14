#!/bin/zsh
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/anda/anda_stock
exec /Users/anda/.local/node/bin/node scripts/fetch-kis.mjs
