#!/bin/zsh
export PATH="$HOME/.local/node/bin:$PATH"
cd /Users/anda/anda_stock/scripts
exec node --env-file=.env ai-bridge.mjs
