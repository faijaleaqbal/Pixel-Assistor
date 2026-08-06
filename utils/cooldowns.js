// src/utils/cooldowns.js
// In-memory per-user per-command cooldown. Default 3s, overridable per command via
// `cooldown` field on the command object.

const config = require('./config');
const buckets = new Map(); // key: `${commandName}:${userId}` -> expiry ts

module.exports = {
  check(commandName, userId, custom) {
    const seconds = custom ?? config.defaultCooldown;
    if (!seconds || seconds <= 0) return 0;
    const key = `${commandName}:${userId}`;
    const now = Date.now();
    const exp = buckets.get(key) || 0;
    if (exp > now) return Math.ceil((exp - now) / 1000);
    buckets.set(key, now + seconds * 1000);
    return 0;
  },
  reset(commandName, userId) {
    buckets.delete(`${commandName}:${userId}`);
  },
};
