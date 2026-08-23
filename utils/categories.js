// src/utils/categories.js
// Per-category metadata: emoji + display name. Used by the help command and ?list.

const EMOJI = {
  admin: '👑',
  crypto: '🪙',
  extra: '⚙️',
  fun: '🎉',
  games: '🎮',
  moderation: '🛡️',
  upi: '💳',
  utility: '🔧',
};

const DISPLAY = {
  admin: 'Admin',
  crypto: 'Crypto',
  extra: 'Extra',
  fun: 'Fun',
  games: 'Games',
  moderation: 'Moderation',
  upi: 'UPI',
  utility: 'Utility',
};

const DESC = {
  admin: 'Server management — anti-nuke, greet, ignore, roles, channels, prefix.',
  crypto: 'Live prices, conversions, balances and on-chain lookups.',
  extra: 'Owner tools — reload, slash sync, leaderboards.',
  fun: '8ball, memes, and jokes.',
  games: 'Reaction, RPS, Tic-Tac-Toe with persistent stats.',
  moderation: 'Full moderation suite — ban, kick, mute, lock, purge, roles, voice, anti-nuke.',
  upi: 'Save and share UPI IDs; render payment QR codes.',
  utility: 'AFK, reminders, tags, tickets, polls, snipe, translate, server/user info.',
};

module.exports = { EMOJI, DISPLAY, DESC };
