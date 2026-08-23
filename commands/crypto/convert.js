// src/commands/crypto/convert.js
// ?convert <amount> <base> <target>  (alias ?cv)
// Convert between fiat and/or crypto using live CoinGecko + free FX rates API.
//
// Supports ALL combinations:
//   • fiat → fiat   (usd → inr)        via open.er-api.com FX rates
//   • fiat → crypto (usd → btc)       FX → CoinGecko
//   • crypto → fiat (btc → usd)       CoinGecko → FX
//   • crypto → crypto (usdt → ltc)    CoinGecko (bridge through USD)
//
// Both base and target are case-insensitive ("USD", "usd", "Usd" all accepted).
//
// Formatting:
//   • fiat → 2 decimals + thousands separators   (e.g. "9,540.17 INR")
//   • crypto → full precision, no truncation     (e.g. "0.02241855508189365 LTC")
//
// Missing amount → exact error format:
//   ⚠️ | You are missing the amount argument!
//   > Usage: ?convert <amount> <base> <target>
//   > Example: ?convert 100 usd inr
//
// Success → embed:
//   💱 | Conversion Result
//   > <amount formatted> <BASE> = <result formatted> <TARGET>
//   Footer: "Requested by <username>"

const responseBuilder = require('../../utils/responseBuilder');
const config = require('../../utils/config');
const { opts } = require('../../utils/v2Reply');
const { convert, isFiat } = require('../../utils/cryptoApi');

const PURPLE = 0x5865F2, RED = 0xED4245, YELLOW = 0xFEE75C;

function formatAmount(amount, code) {
  if (isFiat(code)) {
    // Fiat: 2 decimals + thousands separators.
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Crypto: full precision, no truncation.
  // Floating-point arithmetic can introduce trailing noise (e.g.
  // 0.02241855 → "0.022418549999999999"). We avoid this by rendering with
  // `toLocaleString` using a generous maximumFractionDigits, which performs
  // correct rounding back to the nearest decimal representation (no float
  // residue). We then strip trailing zeros after the decimal point.
  if (!Number.isFinite(amount)) return '0';
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 18,
    useGrouping: true,
  });
  // Trim trailing zeros after the decimal point (and the dot if integer).
  return formatted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function formatBaseAmount(amount, code) {
  // For the input amount, render 2 decimals for fiat, full precision for crypto.
  if (isFiat(code)) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // For crypto input, keep up to 8 decimals for readability (the user typed it).
  return amount.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

module.exports = {
  name: 'convert',
  aliases: ['cv'],
  category: 'crypto',
  description: 'Convert between fiat and/or crypto. Usage: convert <amount> <base> <target>',
  usage: '<amount> <base> <target>',
  cooldown: 5,
  args: true,
  async execute(message, args, client) {
    // Detect missing amount — the spec calls for an EXACT error format.
    // We treat any non-numeric first arg as "amount missing" so "?convert usd inr"
    // triggers the friendly error rather than a generic usage dump.
    const first = args[0];
    // Use parseFloat (NOT Number) so hex like 0x10 and scientific like 1e5 are rejected.
    // parseFloat only accepts decimal digits + optional sign + optional exponent,
    // but we explicitly reject scientific notation to keep amounts human-readable.
    const firstAsFloat = parseFloat(first);
    const looksScientific = /^[+-]?\d*\.?\d+e[+-]?\d+$/i.test(first);
    const looksHex = /^0x[0-9a-f]+$/i.test(first);
    const amountMissing = !first
      || Number.isNaN(firstAsFloat)
      || firstAsFloat < 0
      || looksScientific
      || looksHex;

    if (amountMissing) {
      return message.reply(opts(responseBuilder.buildResult({ description: `⚠️ | You are missing the amount argument!\n` +
          `> Usage: \`${config.prefix}convert <amount> <base> <target>\`\n` +
          `> Example: \`${config.prefix}convert 100 usd inr\``})));
    }

    const amount = firstAsFloat;
    const base = String(args[1] || '').toLowerCase();
    const target = String(args[2] || '').toLowerCase();

    if (!base || !target) {
      return message.reply(opts(responseBuilder.buildResult({ description: `⚠️ | You are missing the ${!base ? 'base' : 'target'} argument!\n` +
          `> Usage: \`${config.prefix}convert <amount> <base> <target>\`\n` +
          `> Example: \`${config.prefix}convert 100 usd inr\``})));
    }

    // Light acknowledgement while we fetch live rates.
    const m = await message.reply(
      opts(responseBuilder.buildResult({ description: '⏳ Fetching live rates…'}))
    );

    try {
      const result = await convert(amount, base, target);

      const baseStr = formatBaseAmount(amount, base);
      const resultStr = formatAmount(result, target);

      return m.edit(
        opts(responseBuilder.buildResult({ title: '💱 | Conversion Result', description: `> ${baseStr} ${base.toUpperCase()} = ${resultStr} ${target.toUpperCase()}`}))
      );
    } catch (e) {
      const msg = e?.message || 'Unknown error';
      let desc = `Conversion failed: **${msg}**`;
      if (msg.includes('rate limit') || msg.includes('429')) {
        desc = '⚠️ **CoinGecko rate limit hit.** Wait 30 seconds and try again.';
      } else if (msg.includes('not supported')) {
        desc = `❌ ${msg}`;
      }
      return m.edit(opts(responseBuilder.buildResult({ description: desc})));
    }
  },
};
