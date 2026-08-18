// src/utils/prefixCache.js
const config = require('./config');
const { getDb } = require('./db');

const cache = new Map(); // guildId -> prefix

async function getPrefix(guildId) {
  if (!guildId) return config.prefix || '?';
  if (cache.has(guildId)) return cache.get(guildId);
  try {
    const db = getDb();
    const gCfg = await db.guildConfig.get(guildId);
    const p = gCfg?.prefix || config.prefix || '?';
    cache.set(guildId, p);
    return p;
  } catch {
    return config.prefix || '?';
  }
}

function setPrefix(guildId, prefix) {
  if (guildId) cache.set(guildId, prefix);
}

function clearPrefix(guildId) {
  if (guildId) cache.delete(guildId);
}

module.exports = { getPrefix, setPrefix, clearPrefix };
