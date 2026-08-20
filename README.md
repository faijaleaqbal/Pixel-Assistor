# Pixel Assistant — Production-Grade Discord Bot

A hardened, production-ready Discord.js v14 bot featuring **124 commands** across **8 categories** (Admin, Crypto, Extra, Fun, Games, Moderation, UPI, Utility), resilient dual-database persistence, live multi-chain crypto transaction parsing, and enterprise security guardrails.

---

## 🌟 Highlights & Architecture

- **Multi-Chain Crypto System**:
  - Full support for EVM chains (Polygon, Ethereum, BNB Chain, Arbitrum, Base, Optimism), Solana (SPL tokens + native SOL), Tron (TRX + TRC-20 USDT), and Litecoin (UTXO accounting with BlockCypher & Esplora).
  - High-precision balance checks, fiat conversions (USD, INR, EUR, GBP, AED, CAD, JPY), and transaction receipts.
- **Security & Hierarchy Protection**:
  - Centralized role and member hierarchy engine preventing unauthorized actions against guild owners, higher-ranking roles, or the bot itself.
  - Server co-owner system strictly locked to the actual Guild Owner.
  - Automatic secret token redaction in all logging streams.
  - Anti-SSRF URL validation for all external HTTP requests.
  - Zero-eval arithmetic calculator powered by deterministic Shunting-Yard AST evaluation.
- **Dual-Database Layer**:
  - **SQLite (Default)**: Out-of-the-box zero-configuration persistence via `better-sqlite3` with indexed tables and WAL mode.
  - **MongoDB (Optional)**: Seamless switch to MongoDB when `MONGO_URI` is provided without breaking command interfaces.
- **Interactive Help UI**:
  - Live category select menu and pagination controls with user session isolation and auto-timeout.
- **High-Reliability Event Dispatcher**:
  - Graceful crash recovery, background reminder & timer pollers, auto-mod with bounded rate limiting, and safe interaction response helpers.

---

## 📋 Command Categories (124 Commands)

| Category | Description | Commands |
| :--- | :--- | :--- |
| **Admin** | Server configuration, anti-nuke, auto-roles, greeting, ignore rules, and prefix management | `antinuke`, `automod`, `autorole`, `backup`, `createrole`, `deleterole`, `greet`, `ignore`, `leave`, `setlogchannel`, `setprefix`, `welcome`, `whitelist` |
| **Crypto** | Multi-chain balance checks, currency conversions, live prices, and transaction explorers | `bal`, `convert`, `price`, `txid` |
| **Extra** | Administrative maintenance and command synchronization | `help`, `reload`, `sync` |
| **Fun** | Social engagement, mini-games, leveling leaderboard, memes, and jokes | `8ball`, `joke`, `leaderboard`, `meme`, `rank` |
| **Games** | Interactive multiplayer games with persistent guild statistics | `reaction`, `reactionstats`, `rockpaperscissors`, `rpsstats`, `tictactoe` |
| **Moderation** | Comprehensive staff tooling, role management, purge, lockouts, and warnings | `addemoji`, `addsticker`, `admin`, `autopurge`, `ban`, `channeladd`, `channelremove`, `channelrename`, `clearwarns`, `clone`, `delemoji`, `delsticker`, `export`, `give`, `hide`, `hideall`, `kick`, `lock`, `lockall`, `mod`, `modlimit`, `modstats`, `mute`, `nick`, `nuke`, `owner`, `persist`, `purge`, `renameemoji`, `renamesticker`, `role`, `rrole`, `softban`, `steal`, `stealall`, `stickersearch`, `timeout`, `unbanall`, `unhide`, `unhideall`, `unlock`, `unlockall`, `unmute`, `untimeout`, `voice`, `warn`, `warnings` |
| **UPI** | Indian digital payment QR generation, UPI address management, and invoicing | `listupi`, `qr`, `removeupi`, `setupi`, `upi` |
| **Utility** | Server utilities, reminders, countdown timers, scheduled messages, transcripts, tags, and tools | `about`, `afk`, `avatar`, `badges`, `banner`, `botinfo`, `calc`, `checkvanity`, `editsnipe`, `embed`, `enlarge`, `firstmsg`, `help`, `invite`, `list`, `membercount`, `node`, `ping`, `poll`, `remind`, `rm`, `roleinfo`, `sent`, `servericon`, `serverinfo`, `settimer`, `shardstats`, `snipe`, `status`, `tag`, `ticket`, `timer`, `translate`, `uptime`, `userinfo`, `view`, `whois` |

---

## 🚀 Quick Start

### 1. Requirements

- **Node.js**: `v18.0.0` or higher
- **npm** or **yarn** / **pnpm**

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/faijaleaqbal/Pixel-Assistor.git
cd Pixel-Assistor

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### 3. Configuration (`.env`)

Fill in your bot credentials in `.env`:

```ini
TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_id_here
OWNER_ID=your_discord_user_id_here
GUILD_ID=your_development_guild_id_here

# Optional Configurations
PREFIX=?
EMBED_COLOR=5865F2
DEFAULT_COOLDOWN=3
DB_SQLITE_PATH=./data/bot.db
MONGO_URI=
```

### 4. Running the Bot

```bash
# Run tests
npm test

# Run static quality analysis
npm run lint

# Start the bot
npm start
```

---

## 🛡️ Production Process Management (PM2)

For 24/7 background operation with auto-restart on system reboot:

```bash
# Start bot and transcript viewer with PM2
npm run pm2:start

# View live logs
npm run pm2:logs

# Restart bot
npm run pm2:restart

# Stop bot
npm run pm2:stop
```

---

## 🧪 Test Suite & Quality Assurance

Pixel Assistant includes a suite of 100 automated unit and integration tests covering:
- **Command Registry**: Validates dynamic loader, metadata contracts, and prevents duplicate aliases.
- **Crypto Subsystem**: EVM, Solana, Tron, and Litecoin UTXO transaction parsers and price decoders.
- **Permission & Hierarchy**: Prevents moderation privilege escalation, self-targeting, and unauthorized configuration.
- **Purge Engine**: Multi-batch slicing, 14-day Discord boundary protection, and bot permission checks.
- **Database Engine**: Verifies SQLite CRUD operations, indexes, schema migrations, and health checks.
- **Math Evaluator**: Ensures zero-eval arithmetic parsing with precedence and division-by-zero protection.
- **Safe Interactions**: Validates graceful handling of expired and unacknowledged Discord interactions.

```bash
npm test
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
