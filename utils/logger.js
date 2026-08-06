// src/utils/logger.js
// Tiny leveled logger — keeps output predictable on Termux/VPS.
// Use logger.info / warn / error / debug instead of console.* everywhere.

const withTs = (lvl, msg, meta) => {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${lvl}] ${msg}`;
  if (meta === undefined || meta === null) return base;
  if (typeof meta === 'string') return `${base} ${meta}`;
  if (meta instanceof Error) {
    // Include the stack when available; fall back to the message + name.
    return `${base} ${meta.stack || `${meta.name}: ${meta.message}`}`;
  }
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    // Fallback for objects with circular references.
    return `${base} [unserializable ${typeof meta}]`;
  }
};

module.exports = {
  info: (msg, meta) => console.log(withTs('INFO', msg, meta)),
  warn: (msg, meta) => console.warn(withTs('WARN', msg, meta)),
  error: (msg, meta) => console.error(withTs('ERROR', msg, meta)),
  debug: (msg, meta) => {
    if (process.env.DEBUG) console.log(withTs('DEBUG', msg, meta));
  },
  success: (msg, meta) => console.log(withTs('OK', msg, meta)),
};
