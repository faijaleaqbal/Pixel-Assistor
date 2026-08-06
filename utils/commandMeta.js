// src/utils/commandMeta.js
// Central registry of every command's metadata (description, category, usage,
// cooldown, perms, aliases). Commands themselves import this and call register().
// The help command reads from here to build its category lists / page counts.

const META = new Map();
const CATEGORIES = ['admin', 'crypto', 'extra', 'fun', 'games', 'moderation', 'upi', 'utility'];

function register(name, meta) {
  if (META.has(name)) {
    const logger = require('./logger');
    logger.warn(`commandMeta: overwriting "${name}"`);
  }
  META.set(name, { name, ...meta });
}

function get(name) {
  return META.get(name);
}

function all() {
  return Array.from(META.values());
}

function byCategory(cat) {
  return all().filter((m) => m.category === cat);
}

function categoryCounts() {
  const out = {};
  for (const c of CATEGORIES) out[c] = byCategory(c).length;
  return out;
}

function total() {
  return META.size;
}

module.exports = { register, get, all, byCategory, categoryCounts, total, CATEGORIES };
