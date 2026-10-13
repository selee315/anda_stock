#!/bin/zsh
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/anda/anda_stock
set -a; source scripts/.env; set +a
export DART_DAYS="2"
exec /Users/anda/.local/node/bin/node scripts/fetch-dart.mjs
