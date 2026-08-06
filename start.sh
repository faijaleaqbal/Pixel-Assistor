#!/usr/bin/env bash
# start.sh — universal launcher for hosting panels.
# Most panels (Pterodactyl, Discord bot hosts, Termux) just need a single
# shell script they can run. This is that script.
#
# Usage on a VPS / container:
#   chmod +x start.sh
#   ./start.sh
#
# It will:
#   1. Install dependencies (if node_modules/ is missing)
#   2. Copy .env.example to .env (if .env is missing) — you MUST edit .env after first run
#   3. Start the bot

set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  Pixel Exchange & MM Assistant"
echo "  Container-friendly launcher"
echo "========================================"

# 1. Install deps if missing
if [ ! -d "node_modules" ]; then
  echo ">> node_modules not found — running npm install..."
  npm install --no-audit --no-fund
fi

# 2. Bootstrap .env on first run
if [ ! -f ".env" ]; then
  echo ">> .env not found — copying from .env.example"
  cp .env.example .env
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "  IMPORTANT"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "  .env was just created with placeholder values."
  echo "  Edit it NOW and fill in:"
  echo "    - TOKEN        (your Discord bot token)"
  echo "    - CLIENT_ID    (your bot application ID)"
  echo "    - GUILD_ID     (your dev server ID)"
  echo "    - OWNER_ID     (your Discord user ID)"
  echo ""
  echo "  Then re-run: ./start.sh"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  exit 1
fi

# 3. Quick sanity check
if [ -z "$TOKEN" ] && ! grep -q "^TOKEN=.\+" .env; then
  echo "!! TOKEN is still empty in .env. Edit .env and re-run."
  exit 1
fi

# 4. Launch
echo ">> Starting bot..."
exec node index.js
