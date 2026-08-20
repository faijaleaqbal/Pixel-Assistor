// src/utils/logger.js
// Production-grade leveled structured logger with automatic secret redaction.

const SENSITIVE_PATTERNS = [
  /([A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38})/g, // Discord Bot Token
  /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s]+/gi, // MongoDB URI with credentials
  /(?:api[_-]?key|token|password|secret|authorization|auth)\s*[:=]\s*['"]?([^\s'",;&]+)/gi,
];

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  let sanitized = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, p1) => {
      if (p1 && match.length > p1.length) {
        return match.replace(p1, '***REDACTED***');
      }
      return '***REDACTED***';
    });
  }
  return sanitized;
}

function sanitizeObject(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }

  if (seen.has(obj)) {
    return '[Circular]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, seen));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (
      lk.includes('token') ||
      lk.includes('password') ||
      lk.includes('secret') ||
      lk.includes('apikey') ||
      lk.includes('key') && (lk.includes('api') || lk.includes('private') || lk.includes('auth'))
    ) {
      result[key] = '***REDACTED***';
    } else if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (value instanceof Error) {
      result[key] = {
        name: value.name,
        message: sanitizeString(value.message),
        stack: sanitizeString(value.stack),
      };
    } else if (typeof value === 'object') {
      result[key] = sanitizeObject(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function withTs(lvl, msg, meta) {
  const ts = new Date().toISOString();
  const safeMsg = sanitizeString(String(msg || ''));
  const base = `[${ts}] [${lvl}] ${safeMsg}`;
  if (meta === undefined || meta === null) return base;
  if (typeof meta === 'string') return `${base} ${sanitizeString(meta)}`;
  if (meta instanceof Error) {
    return `${base} ${sanitizeString(meta.stack || `${meta.name}: ${meta.message}`)}`;
  }
  try {
    const cleaned = sanitizeObject(meta);
    return `${base} ${JSON.stringify(cleaned)}`;
  } catch {
    return `${base} [unserializable ${typeof meta}]`;
  }
}

module.exports = {
  info: (msg, meta) => console.log(withTs('INFO', msg, meta)),
  warn: (msg, meta) => console.warn(withTs('WARN', msg, meta)),
  error: (msg, meta) => console.error(withTs('ERROR', msg, meta)),
  debug: (msg, meta) => {
    if (process.env.DEBUG) console.log(withTs('DEBUG', msg, meta));
  },
  success: (msg, meta) => console.log(withTs('OK', msg, meta)),
  sanitize: sanitizeString,
  sanitizeObject,
};
