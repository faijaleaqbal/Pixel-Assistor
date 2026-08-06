// src/utils/ms.js
// Tiny duration parser/formatter. Avoids pulling ms as a dep.
// This is the SINGLE source of truth for duration parsing across the bot —
// every command (?sent, ?settimer, ?rm, ?role temp, ?mute, ?timeout, etc.)
// should call parse() / format() from here, not roll its own regex.

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000, y: 365.25 * 86_400_000 };

// Unified regex — accepts s/m/h/d/w/y. Keep in sync with UNITS keys.
const DURATION_RE = /^(\d+)([smhdwy])$/i;

function parse(str) {
  if (!str) return 0;
  if (/^\d+$/.test(str)) return parseInt(str, 10); // plain ms
  const m = DURATION_RE.exec(str);
  if (!m) return 0;
  return parseInt(m[1], 10) * UNITS[m[2].toLowerCase()];
}

/** Returns true iff `str` is a valid duration token (e.g. "30s", "5m", "2h", "1d", "1w", "1y"). */
function isDuration(str) {
  return typeof str === 'string' && DURATION_RE.test(str);
}

function format(ms) {
  if (!ms) return '0ms';
  const parts = [];
  let rem = ms;
  const y = Math.floor(rem / UNITS.y); rem -= y * UNITS.y;
  const w = Math.floor(rem / UNITS.w); rem -= w * UNITS.w;
  const d = Math.floor(rem / UNITS.d); rem -= d * UNITS.d;
  const h = Math.floor(rem / UNITS.h); rem -= h * UNITS.h;
  const m = Math.floor(rem / UNITS.m); rem -= m * UNITS.m;
  const s = Math.floor(rem / UNITS.s);
  if (y) parts.push(`${y}y`);
  if (w) parts.push(`${w}w`);
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0ms';
}

module.exports = {
  parse,
  format,
  isDuration,
  DURATION_RE,
  days: (n) => n * UNITS.d,
  hours: (n) => n * UNITS.h,
  minutes: (n) => n * UNITS.m,
  seconds: (n) => n * UNITS.s,
  weeks: (n) => n * UNITS.w,
  years: (n) => n * UNITS.y,
};
