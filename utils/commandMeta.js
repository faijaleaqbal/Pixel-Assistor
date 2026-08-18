// src/utils/commandMeta.js
// Central registry of every command's metadata.
// Categories are dynamically discovered from registered commands.
// Rejects duplicate command names to prevent silent overwrites.

const META = new Map();
const CATEGORIES_SET = new Set();

function register(name, meta) {
  const cleanName = String(name || '').toLowerCase().trim();
  if (!cleanName) {
    throw new Error('commandMeta.register: Command name cannot be empty.');
  }

  if (META.has(cleanName)) {
    throw new Error(`commandMeta.register: Duplicate command name "${cleanName}" detected. Cannot overwrite.`);
  }

  const category = (meta.category || 'utility').toLowerCase().trim();
  CATEGORIES_SET.add(category);

  META.set(cleanName, {
    name: cleanName,
    ...meta,
    category,
  });
}

function get(name) {
  return META.get(String(name || '').toLowerCase().trim());
}

function all() {
  return Array.from(META.values());
}

function byCategory(cat) {
  const target = String(cat || '').toLowerCase().trim();
  return all().filter((m) => m.category === target);
}

function getCategories() {
  return Array.from(CATEGORIES_SET.values()).sort();
}

function categoryCounts() {
  const out = {};
  for (const c of getCategories()) {
    out[c] = byCategory(c).length;
  }
  return out;
}

function total() {
  return META.size;
}

function clear() {
  META.clear();
  CATEGORIES_SET.clear();
}

module.exports = {
  register,
  get,
  all,
  byCategory,
  getCategories,
  categoryCounts,
  total,
  clear,
  get CATEGORIES() {
    return getCategories();
  },
};
