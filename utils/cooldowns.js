// src/utils/cooldowns.js
// Production-grade bounded cooldown tracker with automatic expiration cleanup.

const config = require('./config');

const MAX_ENTRIES = 10000;
const buckets = new Map(); // key: `${commandName}:${userId}` -> expiry ts

function cleanupExpired() {
  const now = Date.now();
  for (const [key, exp] of buckets.entries()) {
    if (exp <= now) {
      buckets.delete(key);
    }
  }
}

// Periodic cleanup every 60 seconds
const cleanupInterval = setInterval(cleanupExpired, 60 * 1000);
if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

module.exports = {
  check(commandName, userId, custom) {
    const seconds = custom ?? config.defaultCooldown;
    if (!seconds || seconds <= 0) return 0;

    const key = `${commandName}:${userId}`;
    const now = Date.now();
    const exp = buckets.get(key) || 0;

    if (exp > now) {
      return Math.ceil((exp - now) / 1000);
    }

    // Evict oldest entries if map exceeds boundary
    if (buckets.size >= MAX_ENTRIES) {
      cleanupExpired();
      if (buckets.size >= MAX_ENTRIES) {
        // Delete first 1000 entries
        let count = 0;
        for (const k of buckets.keys()) {
          buckets.delete(k);
          if (++count >= 1000) break;
        }
      }
    }

    buckets.set(key, now + seconds * 1000);
    return 0;
  },

  reset(commandName, userId) {
    buckets.delete(`${commandName}:${userId}`);
  },

  clear() {
    buckets.clear();
  },

  size() {
    return buckets.size;
  },
};
