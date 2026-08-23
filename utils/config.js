// src/utils/config.js
// Centralised config loaded from .env. Single source of truth for the whole bot.
require('dotenv').config();

const toBool = (v, def = false) => {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on', 'y'].includes(String(v).toLowerCase());
};

const toInt = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
};

module.exports = {
  token: process.env.TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  ownerId: process.env.OWNER_ID || '',

  prefix: process.env.PREFIX || '?',
  defaultCooldown: toInt(process.env.DEFAULT_COOLDOWN, 3),
  embedColor: parseInt(process.env.EMBED_COLOR || '7C3AED', 16),
  helpFooterName: process.env.HELP_FOOTER_NAME || '',
  helpEmojis: {
    spacer: process.env.EMOJI_SPACER || '',
    chevron: process.env.EMOJI_CHEVRON || '➜',
    automod: process.env.EMOJI_AUTOMOD || '🤖',
    king: process.env.EMOJI_KING || '👑',
  },

  // DB: SQLite handles ALL data. MongoDB is optional (preferred if available).
  sqlitePath: process.env.DB_SQLITE_PATH || './data/bot.db',
  mongoUri: process.env.MONGO_URI || '',

  lavalink: {
    host: process.env.LAVALINK_HOST || '',
    port: toInt(process.env.LAVALINK_PORT, 2333),
    password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
    secure: toBool(process.env.LAVALINK_SECURE, false),
  },

  // Crypto APIs (all optional)
  alchemyApiKey: process.env.ALCHEMY_API_KEY || '',
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
  coingeckoDemoApiKey: process.env.COINGECKO_DEMO_API_KEY || '',
  polygonscanApiKey: process.env.POLYGONSCAN_API_KEY || '',
  bscscanApiKey: process.env.BSCSCAN_API_KEY || process.env.POLYGONSCAN_API_KEY || '',
  etherscanApiKey: process.env.ETHERSCAN_API_KEY || process.env.POLYGONSCAN_API_KEY || '',
  trongridApiKey: process.env.TRONGRID_API_KEY || '',
  heliusApiKey: process.env.HELIUS_API_KEY || '',
  blockcypherToken: process.env.BLOCKCYPHER_TOKEN || '',
  // Free FX rates API (no key required) — used by ?convert for fiat→fiat pairs.
  // Override only if you have a paid provider that mirrors the open.er-api.com shape.
  fxApiBase: process.env.FX_API_BASE || 'https://open.er-api.com/v6',

  lastfmApiKey: process.env.LASTFM_API_KEY || '',

  deployManager: (process.env.DEPLOY_MANAGER || 'pm2').toLowerCase(),

  // Transcript viewer service (separate process in /transcript-viewer)
  viewerBaseUrl: process.env.VIEWER_BASE_URL || '',

  ownerIds: (process.env.OWNER_IDS || '').split(',').filter(Boolean),
};
