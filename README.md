# Pixel Exchange & MM Assistant

A production-ready Discord.js v14 bot with **158 user commands** + an interactive help menu, spread across **9 categories**: Admin, Crypto, Extra, Filters, Games, Moderation, Music, UPI, Utility.

- **Prefix commands** (`?` by default) with dynamic file-based loader
- **Help menu**: live reusable dropdown + Prev/Next pagination, no need to re-run `?help`
- **Database**: SQLite (default) or MongoDB — switch via `DB_DRIVER`
- **Music**: discord-player v6 + `@discord-player/extractor` + `play-dl` fallback. Lavalink supported if configured
- **Deploy targets**: pm2, systemd, or Termux — all supported with graceful fallback in `?reload`

---

## 1. Requirements

- **Node.js ≥ 18** (uses global `fetch`, native test runner, optional chaining everywhere)
- **FFmpeg** installed system-wide (required by discord-player for audio decoding)
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Termux: `pkg install ffmpeg`
  - macOS: `brew install ffmpeg`
- For SQLite (default): nothing extra — `better-sqlite3` ships prebuilt binaries for most platforms
- For MongoDB: a running `mongod` or a MongoDB Atlas connection string

---

## 2. Install (container / VPS — flat layout, `index.js` at root)

This version is **flattened** — `index.js`, `package.json`, `.env.example`, `start.sh`, `Procfile` are all at the **root** of the zip, alongside `commands/`, `events/`, `handlers/`, `utils/`. This works on panels that run `node index.js` from the working directory (Pterodactyl, most Discord bot hosts, Termux, plain VPS).

```bash
# Upload the zip to your VPS / panel, then:
unzip discord-bot-flat.zip
cd discord-bot-flat
npm install
cp .env.example .env
# edit .env — fill in at least TOKEN, CLIENT_ID, OWNER_ID
node index.js
```

### Even simpler: use `start.sh`

```bash
chmod +x start.sh
./start.sh
```

It will install deps if missing, bootstrap `.env` on first run (and remind you to edit it), then launch the bot.

### Required env vars

| Var        | Why                                            |
|------------|------------------------------------------------|
| `TOKEN`    | Bot login token                                |
| `CLIENT_ID`| Application ID (used by `?sync`)               |
| `OWNER_ID` | Your Discord user ID — owner-only commands + help footer |
| `GUILD_ID` | Dev server ID — used by `?sync` (guild-level)  |

Everything else is **optional** — the bot runs even with zero API keys; unconfigured commands reply cleanly.

---

## 3. Run

### Plain Node
```bash
node src/index.js
```

### pm2 (VPS — recommended)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup      # follow printed instructions to enable boot-on-startup
```
Logs: `pm2 logs pixel-bot` • Restart: `pm2 restart pixel-bot` • Stop: `pm2 stop pixel-bot`

### systemd (VPS)
Create `/etc/systemd/system/pixel-bot.service`:
```ini
[Unit]
Description=Pixel Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/pixel-bot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pixel-bot
sudo journalctl -u pixel-bot -f   # logs
```
Set `DEPLOY_MANAGER=systemd` in `.env` so `?reload` uses `SIGTERM`.

### Termux (Android)
```bash
pkg install nodejs ffmpeg
termux-wake-lock
# simple keep-alive loop:
while true; do node src/index.js; sleep 3; done
```
Set `DEPLOY_MANAGER=termux` in `.env`. `?reload` calls `process.exit(0)`; the loop respawns it.

---

## 4. Slash command sync (optional)

The bot ships with prefix commands out of the box. To additionally register slash commands (only commands that have `slash: true` in their module are synced):

```bash
?sync          # sync to dev guild (instant)
?sync global   # sync globally (can take up to 1h)
?sync clear    # remove all slash commands
```

Owner-only.

---

## 5. Command categories

| Category    | Count | Highlights |
|-------------|-------|------------|
| ⚙️ Admin     | 12    | `automod`, `autorole`, `welcome`, `leave`, `greet`, `ignore`, `antinuke`, `setprefix`, `setlogchannel`, `createrole`, `deleterole`, `backup` |
| 🪙 Crypto    | 4     | `price`, `convert` (alias `cv`), `bal`, `txid` (alias `tx`) — multi-chain |
| ⚙️ Extra     | 3     | `reload`, `sync`, `top` |
| 🎛️ Filters   | 1     | `filter` (bassboost, nightcore, 8d, ...) |
| 🎮 Games     | 5     | `reaction`, `rockpaperscissors`, `tictactoe` + persistent stats |
| 🛡️ Moderation | 54    | ban/kick/mute/lock/nuke/clone/persist/role/rrole/voice/hideall/lockall/purge/antinuke/... |
| 🎵 Music     | 34    | play/queue/lyrics/artistradio/mood/sleep/forcefix/... |
| 💸 UPI       | 5     | `setupi`, `listupi`, `upi`, `removeupi`, `qr` (renders UPI QR PNG) |
| 🧰 Utility   | 35    | afk/avatar/banner/badges/translate/tag/invite/about/botinfo/uptime/ping/poll/remind/rm/settimer/serverinfo/ticket/userinfo/... |

Plus the interactive `?help` command itself → **159 total**.

Run `?help` to open the live dropdown menu.

---

## 6. Optional API keys

| Variable                | Used by                          | Where to get                          |
|-------------------------|----------------------------------|---------------------------------------|
| `COINGECKO_API_KEY`     | `?price`, `?convert`, `?txid` USD value | https://www.coingecko.com/api/pricing (free tier works without key) |
| `POLYGONSCAN_API_KEY`   | `?txid` / `?bal` (Polygon) — also used as fallback for BNB/ETH if their keys are not set | https://polygonscan.com/apis         |
| `BSCSCAN_API_KEY`       | `?txid` / `?bal` (BNB Chain)    | https://bscscan.com/apis              |
| `ETHERSCAN_API_KEY`     | `?txid` / `?bal` (Ethereum)     | https://etherscan.io/apis             |
| `TRONGRID_API_KEY`      | `?txid` / `?bal` (Tron, USDT-TRC20) | https://www.trongrid.io/             |
| `HELIUS_API_KEY`        | `?txid` / `?bal` (Solana)       | https://www.helius.dev/              |
| `BLOCKCYPHER_TOKEN`     | `?txid` / `?bal` (Litecoin + BTC) | https://accounts.blockcypher.com/    |
| `LASTFM_API_KEY`        | `?artistradio`, `?similar`       | https://www.last.fm/api               |
| `LAVALINK_HOST`         | Music extractor (optional)       | self-hosted Lavalink v3/v4           |

---

## 7. Project structure (flat — root-level, no `src/` wrapper)

```
/                       ← everything at the project root
  index.js              ← entry point (panel runs: node index.js)
  package.json          ← "main": "index.js"
  .env.example
  ecosystem.config.js   ← pm2 config (script: index.js)
  start.sh              ← universal launcher for panels (chmod +x, ./start.sh)
  Procfile              ← for Heroku-style panels (worker: node index.js)
  README.md
  /commands
    /admin         automod, autorole, welcome, leave, setprefix, setlogchannel,
                   createrole, deleterole, backup
    /crypto        bal, convert, price, txid
    /extra         reload, sync, top
    /filters       filter
    /games         reaction, reactionstats, rockpaperscissors, rpsstats, tictactoe
    /moderation    35 commands (autopurge, ban, purge, mute, nuke, persist, role, ...)
    /music         34 commands (play, queue, skip, lyrics, mood, sleep, forcefix, ...)
    /upi           listupi, qr, removeupi, setupi, upi
    /utility       afk, avatar, banner, calc, editsnipe, embed, help, list, ping,
                   poll, remind, rm, settimer, serverinfo, snipe, ticket, timer,
                   userinfo, view
  /events          ready, messageCreate, interactionCreate, guildMemberAdd/Remove,
                   voiceStateUpdate, messageDelete/Update
  /handlers        commandHandler.js, eventHandler.js
  /utils           config, db, embeds, pagination, cooldowns, perms, logger,
                   commandMeta, categories, ms, snipeCache, cryptoApi, musicHelpers,
                   player, reminderPoller
  /data            ← created on first run (SQLite db lives here)
```

---

## 8. Help menu design (the live dropdown)

The `?help` command sends ONE message containing:
1. A home embed listing all 8 categories with command counts.
2. A `StringSelectMenu` (dropdown) with id `help_category_select`.
3. A row of buttons: `🏠 Home` / `◀ Prev` / `Page X/Y` / `Next ▶`.

All interactions are routed back through `events/interactionCreate.js` → `commands/utility/help.js#handleInteraction`, which edits the SAME message in place. The dropdown **stays live** — after picking one category, the user can immediately pick another, with no need to re-run `?help`.

The footer reads: `Developed by <owner username> • <timestamp>` — owner username is fetched from `OWNER_ID` at runtime.

---

## 9. Notes on robustness

- Every `execute()` is wrapped in a try/catch in `messageCreate.js`. Errors are logged to console and replied as a clean red embed — never crashes the process.
- `unhandledRejection` / `uncaughtException` are logged but do NOT auto-exit (lets pm2/systemd/Termux restart only on real crashes).
- Cooldowns are per-user per-command (3s default, overridable per command).
- All moderation commands check permissions via Discord's `PermissionsBitField` and report the missing permission name to the user.
- Snipe/editsnipe cache is in-memory, bounded to last 10 per channel — no unbounded growth.
- Reminder poller runs every 5s, delivering due reminders to the original channel.
- Persist-roles: up to 5 sticky roles per member, re-applied on rejoin (via `guildMemberAdd`).

---

## 10. Auto-Moderation System

The bot includes a built-in auto-mod system with three modules, all configurable via commands (no config file editing needed). Settings are per-server and persist in the database.

### Bad Word Filter
Deletes messages containing filtered words and DMs the offender.

```bash
?automod badwords add hell,damn,shit
?automod badwords remove damn
?automod badwords list
?automod badwords clear
```

### Anti-Link
Auto-deletes any URL or Discord invite sent by non-Administrators.

```bash
?automod antilink on
?automod antilink off
?automod antilink          # view current status
```

### Anti-Spam
If a user sends 5+ messages within 3 seconds, they receive an automatic 10-second timeout.

```bash
?automod antispam on
?automod antispam off
?automod antispam         # view current status
```

### Auto-Role
Automatically assigns a role to every new member when they join.

```bash
?autorole set @Members
?autorole set Verified
?autorole remove
?autorole                 # view current auto-role
```

### Welcome Messages
Send an embed welcome message when a new member joins.

```bash
?welcome set #welcome
?welcome message Welcome to {server}, {user}! You are member #{count}.
?welcome preview
?welcome disable
```

Variables: `{user}` (mentions the user), `{server}` (server name), `{count}` (member count).

### Leave Messages
Send an embed leave message when a member leaves or is kicked.

```bash
?leave set #logs
?leave message Goodbye, {user}. We'll miss you!
?leave preview
?leave disable
```

Variables: `{user}` (user tag), `{server}` (server name).

---

## 11. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Error: Cannot find module 'better-sqlite3'` | `npm rebuild better-sqlite3` or switch to `DB_DRIVER=mongo` |
| Music commands reply "Nothing is playing" | Make sure FFmpeg is installed: `ffmpeg -version` |
| `?play` returns no results | YouTube sometimes rate-limits — set `play-dl` cookies (see discord-player docs) or use direct URLs |
| Bot doesn't respond to `?help` | Check `MessageContent` intent is enabled in the Discord Developer Portal |
| `?reload` does nothing on Termux | Make sure you're running inside the `while true; do node index.js; done` loop, or use `pm2` |
| `?tx` / `?bal` shows no USD price | Set `COINGECKO_DEMO_API_KEY` in `.env` — CoinGecko now requires an API key even on the free tier |
| Transcript link doesn't work | Make sure `PUBLIC_HOST` is set to your VPS IP/domain in `.env` and `TRANSCRIPT_PORT` is not blocked by firewall |

---

Built with discord.js v14.
