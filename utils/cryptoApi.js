// src/utils/cryptoApi.js
// Thin wrappers around CoinGecko, Etherscan-family explorers (Polygon / BscScan /
// Etherscan), TronGrid, Helius (Solana) and BlockCypher (Litecoin/BTC).
//
// All keys are optional — if a key is missing, the affected function throws a
// clean "not configured" error which the command layer turns into a user-facing reply.
//
// Improvements vs. previous version:
//   - Per-chain EVM explorer lookups (Polygon / BNB / ETH) using Etherscan-style API
//   - Wallet balance + USDT (Polygon-ERC20 / BEP20 / TRC20) lookups
//   - Proper free FX rates API (open.er-api.com) for fiat→fiat conversions
//   - Hash-format + address-format detection helpers
//   - 10s fetch timeout (AbortController)
//   - In-memory price cache (30s TTL) to dodge rate limits

const config = require('./config');

const CG = config.coingeckoApiKey
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

const FETCH_TIMEOUT = 10_000; // 10 seconds

// ── Price cache (60s TTL — doubled from 30s to reduce CoinGecko rate-limit hits) ──
const priceCache = new Map(); // coinId -> { usd, expires }
const CACHE_TTL = 60_000;

// ── Batched price fetch ──
// CoinGecko's /simple/price endpoint accepts a comma-separated list of `ids`,
// so a SINGLE request can return prices for many coins. This is critical for
// avoiding rate limits: a single ?bal invocation that needs native + USDT
// prices previously fired 2 separate requests; across a 5-chain test that was
// 7 requests in 3 seconds → 429 wall.
//
// How it works:
//   - getUsdPrice(id) checks the cache first.
//   - On a miss, it adds the id to a pending batch and waits on a Promise.
//   - A microtask-delayed "flush" coalesces ALL pending ids into ONE request.
//   - All waiters resolve with their slice of the response.
let pendingBatch = null;
let flushTimer = null;

async function fetchBatchPrices(coinIds) {
  // Deduplicate + skip already-cached ids (they should have been filtered out
  // by the caller, but be defensive).
  const unique = [...new Set(coinIds.filter((id) => id && !priceCache.has(id)))];
  if (!unique.length) return {};

  const url = `${CG}/simple/price?ids=${encodeURIComponent(unique.join(','))}&vs_currencies=usd`;
  dbg('fetchBatchPrices URL:', redactUrl(url), '— ids:', unique.join(','));

  let r;
  try {
    r = await fetchWithTimeout(url, { headers: cgHeaders() });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('CoinGecko request timed out (10s). Try again later.');
    throw new Error('Could not reach CoinGecko. Check your internet connection.');
  }

  if (r.status === 429) {
    // Read the body for diagnostics, then throw a clear error.
    let body = '';
    try { body = await r.text(); } catch {}
    console.error(`[cryptoApi] fetchBatchPrices 429 rate-limit body: ${body.slice(0, 200)}`);
    throw new Error('CoinGecko rate limit hit. Wait a few seconds and try again.');
  }

  if (!r.ok) {
    const body = await r.text();
    console.error(`[cryptoApi] fetchBatchPrices ${r.status} body: ${body.slice(0, 300)}`);
    throw new Error(`CoinGecko returned status ${r.status}: ${body.slice(0, 200)}`);
  }

  const j = await safeJson(r, 'CoinGecko fetchBatchPrices', url);
  if (j.error) throw new Error(`CoinGecko: ${j.error}`);

  // Cache each returned price. CoinGecko omits unknown ids from the response —
  // for those we cache a null marker so we don't keep retrying them.
  const now = Date.now();
  for (const id of unique) {
    const usd = j[id]?.usd;
    if (typeof usd === 'number' && Number.isFinite(usd)) {
      priceCache.set(id, { usd, expires: now + CACHE_TTL });
    } else {
      // Negative cache for 30s so we don't hammer CoinGecko with bad ids.
      priceCache.set(id, { usd: null, expires: now + 30_000 });
      dbg(`fetchBatchPrices: CoinGecko returned no USD price for id="${id}"`);
    }
  }
  return j;
}

/**
 * Flush the pending batch (called on a short delay to coalesce concurrent calls).
 * Retries once on rate-limit after a 2s backoff.
 */
async function flushBatch() {
  const batch = pendingBatch;
  pendingBatch = null;
  flushTimer = null;
  if (!batch) return;

  const ids = Object.keys(batch);
  try {
    await fetchBatchPrices(ids);
    // Resolve each waiter with its cached price.
    for (const id of ids) {
      const entry = priceCache.get(id);
      const price = entry ? entry.usd : null;
      batch[id].resolve(price);
    }
  } catch (e) {
    // If it was a rate-limit, retry once after a 2s backoff.
    if (e.message && e.message.includes('rate limit') && !batch.__retried) {
      dbg('fetchBatchPrices rate-limited — retrying once after 2s backoff');
      batch.__retried = true;
      setTimeout(() => {
        // Re-queue all the ids from this failed batch.
        for (const id of ids) {
          getUsdPrice(id).then(
            (v) => batch[id].resolve(v),
            (err) => batch[id].reject(err),
          );
        }
      }, 2000);
      return;
    }
    // Other errors: reject all waiters.
    for (const id of ids) {
      batch[id].reject(e);
    }
  }
}

function cgHeaders() {
  const h = { accept: 'application/json' };
  // CoinGecko now requires an API key even on the free demo tier.
  // Prefer the paid pro key; fall back to the free demo key.
  if (config.coingeckoApiKey) {
    h['x-cg-pro-api-key'] = config.coingeckoApiKey;
  } else if (config.coingeckoDemoApiKey) {
    h['x-cg-demo-api-key'] = config.coingeckoDemoApiKey;
  }
  return h;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || FETCH_TIMEOUT);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strip API keys / tokens from a URL before logging it.
 * Prevents `console.log(url)` from leaking POLYGONSCAN_API_KEY, TRONGRID API key,
 * Helius API key, BlockCypher token, etc. into the bot's log output.
 */
function redactUrl(url) {
  if (!url) return url;
  return String(url)
    .replace(/([?&]apikey=)[^&]+/gi, '$1<redacted>')
    .replace(/([?&]api-key=)[^&]+/gi, '$1<redacted>')
    .replace(/([?&]token=)[^&]+/gi, '$1<redacted>')
    .replace(/([?&]TRON-PRO-API-KEY:\s*)[^\s,]+/gi, '$1<redacted>');
}

/**
 * Debug log helper — only prints when DEBUG env var is set. Used for verbose
 * crypto-API diagnostic output (chain traversal, balance breakdowns, etc.)
 * to keep production logs clean.
 */
function dbg(...args) {
  if (process.env.DEBUG) console.log('[cryptoApi]', ...args);
}

/**
 * Safely parse a Response body as JSON. Verifies the Content-Type header BEFORE
 * calling .json() — many API providers (Polygonscan, BscScan, Etherscan, TronGrid,
 * BlockCypher, Helius, CoinGecko, open.er-api.com) return HTML error pages / CAPTCHA
 * pages / Cloudflare interstitials with a 200 OK status, which would otherwise cause
 * .json() to throw "Unexpected token < in JSON".
 *
 * Bug class: ?txid previously crashed on a Polygonscan HTML 200 response — this helper
 * prevents that pattern from recurring across every fetch call.
 */
async function safeJson(r, label = 'API', url = '') {
  const ctx = url ? ` ${redactUrl(url)}` : '';
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json') && !ct.includes('text/json')) {
    let body = '';
    try { body = await r.text(); } catch { /* ignore */ }
    console.error(`[cryptoApi] ${label}:${ctx} non-JSON response (Content-Type: ${ct || 'missing'}): ${body.slice(0, 300)}`);
    throw new Error(`${label} returned a non-JSON response (Content-Type: ${ct || 'missing'}). The service may be rate-limiting, blocked, or returning a CAPTCHA page.`);
  }
  try {
    return await r.json();
  } catch (e) {
    let body = '';
    try { body = await r.text(); } catch { /* ignore */ }
    console.error(`[cryptoApi] ${label}:${ctx} JSON parse failed: ${e.message}. Body: ${body.slice(0, 300)}`);
    throw new Error(`${label} returned malformed JSON. The service may be temporarily unavailable.`);
  }
}

async function getPrice(coin) {
  // NOTE: ?price command needs eur, inr, AND 24h change — so this function fires
  // its own request. The ?tx / ?bal USD-only path uses getUsdPrice() instead,
  // which batches multiple coin IDs into a single request to dodge rate limits.
  const url = `${CG}/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd,eur,inr&include_24hr_change=true`;
  dbg('getPrice URL:', redactUrl(url));

  let r;
  try {
    r = await fetchWithTimeout(url, { headers: cgHeaders() });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('CoinGecko request timed out (10s). Try again later.');
    throw new Error('Could not reach CoinGecko. Check your internet connection.');
  }

  if (r.status === 429) throw new Error('CoinGecko rate limit hit. Wait a few seconds and try again.');

  if (!r.ok) {
    // Read the response body BEFORE throwing — it usually explains the problem
    const body = await r.text();
    console.error(`[cryptoApi] getPrice ${r.status} response body: ${body}`);
    throw new Error(`CoinGecko returned status ${r.status}: ${body.slice(0, 200)}`);
  }

  const j = await safeJson(r, 'CoinGecko getPrice', url);
  if (j.error) throw new Error(`CoinGecko: ${j.error}`);
  if (!j[coin]) throw new Error(`Unknown coin id: "${coin}". Try a different name or ticker.`);

  // Cache the USD slice so concurrent getUsdPrice() calls for the same coin
  // don't re-fetch.
  const usd = j[coin]?.usd;
  if (typeof usd === 'number' && Number.isFinite(usd)) {
    priceCache.set(coin, { usd, expires: Date.now() + CACHE_TTL });
  }
  return j[coin];
}

async function searchCoin(query) {
  // Guard: never send an empty query to CoinGecko
  if (!query || !query.trim()) throw new Error('Empty search query.');

  const url = `${CG}/search?query=${encodeURIComponent(query)}`;
  dbg('searchCoin URL:', redactUrl(url));

  let r;
  try {
    r = await fetchWithTimeout(url, { headers: cgHeaders() });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('CoinGecko search timed out. Try again.');
    throw new Error('Could not reach CoinGecko. Check your internet connection.');
  }

  if (r.status === 429) throw new Error('CoinGecko rate limit hit. Wait a moment and try again.');

  if (!r.ok) {
    // Read the response body BEFORE throwing — it usually explains the problem
    const body = await r.text();
    console.error(`[cryptoApi] searchCoin ${r.status} response body: ${body}`);
    throw new Error(`CoinGecko search returned status ${r.status}: ${body.slice(0, 200)}`);
  }

  const j = await safeJson(r, 'CoinGecko searchCoin', url);
  if (j.error) throw new Error(`CoinGecko: ${j.error}`);
  return (j.coins || []).slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fiat FX rates (free, no key required) — open.er-api.com
// ─────────────────────────────────────────────────────────────────────────────
const fxCache = { data: null, expires: 0 };

async function getFxRates() {
  if (fxCache.data && Date.now() < fxCache.expires) return fxCache.data;
  const base = (config.fxApiBase || 'https://open.er-api.com/v6').replace(/\/+$/, '');
  const url = `${base}/latest/USD`;
  let r;
  try {
    r = await fetchWithTimeout(url, { headers: { accept: 'application/json' } });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('FX rates request timed out. Try again later.');
    throw new Error('Could not reach FX rates service. Check your internet connection.');
  }
  if (!r.ok) throw new Error(`FX rates API returned status ${r.status}.`);
  const j = await safeJson(r, 'FX rates', url);
  if (!j || !j.rates) throw new Error('FX rates API returned an unexpected payload.');
  fxCache.data = j.rates;
  fxCache.expires = Date.now() + 5 * 60_000; // 5 minute cache
  return j.rates;
}

const FIAT_CODES = new Set([
  'usd', 'eur', 'inr', 'pkr', 'gbp', 'jpy', 'aud', 'cad', 'cny', 'sgd', 'aed',
  'sar', 'chf', 'sek', 'nzd', 'brl', 'zar', 'mxn', 'rub', 'try', 'thb', 'idr',
  'myr', 'php', 'vnd', 'krw', 'hkd', 'twd', 'ils', 'pln', 'czk', 'huf', 'ron',
  'ngn', 'egp', 'bdt', 'lkr', 'npr', 'kes', 'ghs', 'tzs', 'ugx', 'etb',
]);

function isFiat(code) {
  return FIAT_CODES.has(String(code || '').toLowerCase());
}

// CoinGecko ticker → coin id map (extensible).
const CG_MAP = {
  btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', usdc: 'usd-coin', sol: 'solana',
  matic: 'matic-network', pol: 'matic-network', ada: 'cardano', xrp: 'ripple',
  doge: 'dogecoin', ltc: 'litecoin', trx: 'tron', bnb: 'binancecoin',
};
function cgId(ticker) {
  const t = String(ticker || '').toLowerCase();
  return CG_MAP[t] || t;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Conversion — fiat↔fiat, crypto↔crypto, fiat↔crypto, crypto↔fiat
// ─────────────────────────────────────────────────────────────────────────────
async function convert(amount, from, to) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be a non-negative number.');
  const f = String(from || '').toLowerCase();
  const t = String(to || '').toLowerCase();
  if (!f || !t) throw new Error('Both base and target currencies must be provided.');
  if (f === t) return amount;

  const fromFiat = isFiat(f);
  const toFiat = isFiat(t);

  // fiat → fiat
  if (fromFiat && toFiat) {
    const rates = await getFxRates();
    const usdFrom = f === 'usd' ? 1 : rates[f];
    const usdTo = t === 'usd' ? 1 : rates[t];
    if (!usdFrom) throw new Error(`Fiat currency "${f.toUpperCase()}" is not supported by the FX rates API.`);
    if (!usdTo) throw new Error(`Fiat currency "${t.toUpperCase()}" is not supported by the FX rates API.`);
    // rates are USD-based: 1 USD = X f, so amount f → USD → t
    return (amount / usdFrom) * usdTo;
  }

  // crypto → crypto (bridge through USD via CoinGecko)
  if (!fromFiat && !toFiat) {
    const fid = cgId(f);
    const tid = cgId(t);
    const fData = await getPrice(fid);
    const tData = await getPrice(tid);
    if (!fData?.usd) throw new Error(`Could not get USD price for ${f.toUpperCase()}.`);
    if (!tData?.usd) throw new Error(`Could not get USD price for ${t.toUpperCase()}.`);
    return (amount * fData.usd) / tData.usd;
  }

  // fiat → crypto  OR  crypto → fiat
  if (fromFiat && !toFiat) {
    const rates = await getFxRates();
    const usdFrom = f === 'usd' ? 1 : rates[f];
    if (!usdFrom) throw new Error(`Fiat currency "${f.toUpperCase()}" is not supported by the FX rates API.`);
    const usdAmount = amount / usdFrom;
    const tData = await getPrice(cgId(t));
    if (!tData?.usd) throw new Error(`Could not get USD price for ${t.toUpperCase()}.`);
    return usdAmount / tData.usd;
  }
  // crypto → fiat
  const fData = await getPrice(cgId(f));
  if (!fData?.usd) throw new Error(`Could not get USD price for ${f.toUpperCase()}.`);
  const usdAmount = amount * fData.usd;
  if (t === 'usd') return usdAmount;
  const rates = await getFxRates();
  const usdTo = rates[t];
  if (!usdTo) throw new Error(`Fiat currency "${t.toUpperCase()}" is not supported by the FX rates API.`);
  return usdAmount * usdTo;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Hash / address format detection
// ─────────────────────────────────────────────────────────────────────────────

// EVM tx hash: 0x + 64 hex chars (66 chars total).
const EVM_TX_RE = /^0x[0-9a-fA-F]{64}$/;
// EVM address: 0x + 40 hex chars (42 chars total).
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
// Litecoin / Bitcoin tx hash: 64 hex chars (no 0x prefix). Tron tx hashes are
// also 64-char hex — we disambiguate via TronGrid before falling back to EVM.
const HEX64_RE = /^[0-9a-fA-F]{64}$/;
// Solana signature / address: base58, ~32-88 chars, no 0x.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
// Litecoin address formats: legacy (L...), M-p2sh, 3-p2sh, or bech32 (ltc1...).
const LTC_ADDR_RE = /^(L|M|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$|^ltc1[02-9ac-hj-np-z]{6,87}$/;
// Tron address: base58, starts with T, ~34 chars.
const TRON_ADDR_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/**
 * Detect which chain a transaction hash *might* belong to.
 * Returns an object describing the candidate chains:
 *   { type: 'evm', ambiguous: true }                       → Polygon / BNB / ETH
 *   { type: 'solana' }                                     → Solana
 *   { type: 'litecoin' }                                   → Litecoin (BlockCypher)
 *   { type: 'tron' }                                       → Tron (TronGrid)
 *   { type: 'unknown' }                                    → invalid / unrecognized
 *
 * Tron hashes are 64-char hex (same shape as LTC) — we treat any 64-char hex
 * hash as "tron-or-litecoin" and ask TronGrid first; if TronGrid has no record
 * we fall back to BlockCypher LTC. The command layer drives this fallback.
 */
function detectTxChain(hash) {
  const h = String(hash || '').trim();
  if (!h) return { type: 'unknown' };
  if (EVM_TX_RE.test(h)) return { type: 'evm', ambiguous: true };
  if (BASE58_RE.test(h) && h.length >= 83 && h.length <= 89) return { type: 'solana' };
  if (HEX64_RE.test(h)) return { type: 'hex64', ambiguous: true }; // LTC or Tron
  return { type: 'unknown' };
}

/**
 * Detect which chain a wallet address belongs to.
 * Returns { type: 'evm', ambiguous: true } | { type: 'solana' }
 *      | { type: 'litecoin' } | { type: 'tron' } | { type: 'unknown' }.
 */
function detectAddressChain(addr) {
  const a = String(addr || '').trim();
  if (!a) return { type: 'unknown' };
  if (EVM_ADDR_RE.test(a)) return { type: 'evm', ambiguous: true };
  if (TRON_ADDR_RE.test(a)) return { type: 'tron' };
  if (LTC_ADDR_RE.test(a)) return { type: 'litecoin' };
  if (BASE58_RE.test(a) && a.length >= 32 && a.length <= 44) return { type: 'solana' };
  return { type: 'unknown' };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Etherscan-family explorer config (Polygon / BNB / ETH share the same API
//  shape — only the host + token differ).
// ─────────────────────────────────────────────────────────────────────────────
const EVM_CHAINS = {
  polygon: {
    label: 'Polygon',
    nativeSymbol: 'POL',
    nativeCoinId: 'matic-network',
    explorerHost: 'https://api.polygonscan.com/api',
    explorerUrl: 'https://polygonscan.com',
    apiKey: () => config.polygonscanApiKey,
    // USDT-ERC20 on Polygon: USDT contract + 6 decimals.
    usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    usdtDecimals: 6,
  },
  bnb: {
    label: 'BNB Chain',
    nativeSymbol: 'BNB',
    nativeCoinId: 'binancecoin',
    explorerHost: 'https://api.bscscan.com/api',
    explorerUrl: 'https://bscscan.com',
    apiKey: () => config.bscscanApiKey,
    // USDT-BEP20: BSC USDT contract, 18 decimals.
    usdtContract: '0x55d398326f99059fF775485246999027B3197955',
    usdtDecimals: 18,
  },
  ethereum: {
    label: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeCoinId: 'ethereum',
    explorerHost: 'https://api.etherscan.io/api',
    explorerUrl: 'https://etherscan.io',
    apiKey: () => config.etherscanApiKey,
    // USDT-ERC20 on Ethereum: Tether contract, 6 decimals.
    usdtContract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    usdtDecimals: 6,
  },
};

/**
 * Look up a transaction hash on a specific EVM chain via Etherscan-style API.
 * Returns a normalised object: { hash, from, to, value, symbol, decimals,
 * timestamp, confirmed, status, gasUsed, explorerTxUrl } or null if not found.
 *
 * Note: Etherscan/Polygonscan/BscScan do NOT support `module=transaction&action=gettxinfo`.
 * The closest equivalent is `module=account&action=txlist&address=...&page=1&offset=N`,
 * which returns the most recent transactions for an address — but we don't know the
 * sender from the hash alone. So we use the official `module=proxy&action=eth_getTransactionByHash`
 * endpoint, which returns the raw tx, then a second call to `eth_getTransactionReceipt`
 * for the status + gas used.
 */
async function evmFetchTx(chainKey, hash) {
  const chain = EVM_CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown EVM chain: ${chainKey}`);
  const key = chain.apiKey();
  if (!key) throw new Error(`${chain.label} API key not configured (set POLYGONSCAN_API_KEY${chainKey === 'bnb' ? ' / BSCSCAN_API_KEY' : chainKey === 'ethereum' ? ' / ETHERSCAN_API_KEY' : ''}).`);

  // 1) Fetch the raw transaction (gives from/to/value).
  const txUrl = `${chain.explorerHost}?module=proxy&action=eth_getTransactionByHash&txhash=${encodeURIComponent(hash)}${key ? `&apikey=${key}` : ''}`;
  dbg('evmFetchTx chain=' + chainKey + ' URL:', redactUrl(txUrl));
  const r = await fetchWithTimeout(txUrl);
  if (!r.ok) {
    const body = await r.text();
    console.error(`[cryptoApi] evmFetchTx ${chain.label} returned ${r.status}: ${body.slice(0, 300)}`);
    throw new Error(`${chain.label} API returned status ${r.status}.`);
  }
  const j = await safeJson(r, `${chain.label} evmFetchTx`, txUrl);
  if (!j || !j.result) return null;
  const tx = j.result;
  if (!tx || !tx.hash) return null;

  // 2) Fetch the receipt (gives status + gasUsed).
  let receipt = null;
  try {
    const rcptUrl = `${chain.explorerHost}?module=proxy&action=eth_getTransactionReceipt&txhash=${encodeURIComponent(hash)}${key ? `&apikey=${key}` : ''}`;
    const r2 = await fetchWithTimeout(rcptUrl);
    if (r2.ok) {
      const j2 = await safeJson(r2, `${chain.label} evmFetchTx receipt`, rcptUrl);
      receipt = j2 && j2.result ? j2.result : null;
    }
  } catch { /* ignore */ }

  // Value is in wei (hex). Convert to ether.
  const value = tx.value && tx.value !== '0x0' ? Number(BigInt(tx.value)) / 1e18 : 0;
  const confirmed = receipt ? receipt.status === '0x1' : true; // assume success if no receipt
  const ts = tx.blockNumber ? Date.now() : null; // Etherscan proxy doesn't return timestamp; we'd need the txlist endpoint for that.
  return {
    chain: chain.label,
    chainKey,
    hash,
    from: tx.from,
    to: tx.to,
    inputs: tx.from ? [{ address: tx.from }] : [],
    outputs: tx.to ? [{ address: tx.to, value }] : [],
    value,
    symbol: chain.nativeSymbol,
    decimals: 18,
    timestamp: ts,
    confirmed,
    isError: confirmed ? '0' : '1',
    gasUsed: receipt && receipt.gasUsed ? Number(BigInt(receipt.gasUsed)) : (tx.gas ? Number(BigInt(tx.gas)) : null),
    explorerTxUrl: `${chain.explorerUrl}/tx/${hash}`,
  };
}

/**
 * Fetch native + USDT balance for an address on a specific EVM chain.
 * Returns { chain, chainKey, address, nativeBalance, nativeSymbol, usdtBalance }.
 */
async function evmFetchBalance(chainKey, address) {
  const chain = EVM_CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown EVM chain: ${chainKey}`);
  const key = chain.apiKey();
  if (!key) throw new Error(`${chain.label} API key not configured (set ${chainKey === 'polygon' ? 'POLYGONSCAN_API_KEY' : chainKey === 'bnb' ? 'BSCSCAN_API_KEY' : 'ETHERSCAN_API_KEY'}).`);

  // Native balance (module=account&action=balance)
  const balUrl = `${chain.explorerHost}?module=account&action=balance&address=${encodeURIComponent(address)}&tag=latest${key ? `&apikey=${key}` : ''}`;
  dbg(`evmFetchBalance ${chainKey} native URL:`, redactUrl(balUrl));
  const r1 = await fetchWithTimeout(balUrl);
  const j1 = await safeJson(r1, `${chain.label} balance`, balUrl);
  const nativeWei = j1 && j1.status === '1' ? BigInt(j1.result) : 0n;
  const nativeBalance = Number(nativeWei) / 1e18;

  // USDT (ERC20) balance via tokenholder action.
  let usdtBalance = 0;
  if (chain.usdtContract) {
    const tUrl = `${chain.explorerHost}?module=account&action=tokenbalance&contractaddress=${chain.usdtContract}&address=${encodeURIComponent(address)}&tag=latest${key ? `&apikey=${key}` : ''}`;
    dbg(`evmFetchBalance ${chainKey} USDT URL:`, redactUrl(tUrl));
    try {
      const r2 = await fetchWithTimeout(tUrl);
      const j2 = await safeJson(r2, `${chain.label} USDT balance`, tUrl);
      if (j2 && j2.status === '1' && j2.result) {
        usdtBalance = Number(BigInt(j2.result)) / Math.pow(10, chain.usdtDecimals);
      }
    } catch { /* ignore token errors */ }
  }

  return {
    chain: chain.label,
    chainKey,
    address,
    nativeBalance,
    nativeSymbol: chain.nativeSymbol,
    nativeCoinId: chain.nativeCoinId,
    usdtBalance,
    usdtSymbol: 'USDT',
    explorerAddrUrl: `${chain.explorerUrl}/address/${address}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tron (TronGrid) — for TRC20 USDT + native TRX
// ─────────────────────────────────────────────────────────────────────────────
const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT-TRC20

async function tronFetchTx(hash) {
  if (!config.trongridApiKey) throw new Error('TronGrid API key not configured (set TRONGRID_API_KEY).');
  const url = `https://api.trongrid.io/v1/transactions/${encodeURIComponent(hash)}`;
  dbg('tronFetchTx URL:', redactUrl(url));
  const r = await fetchWithTimeout(url, { headers: { 'TRON-PRO-API-KEY': config.trongridApiKey } });
  if (!r.ok) {
    if (r.status === 404) return null;
    const body = await r.text();
    console.error(`[cryptoApi] tronFetchTx ${r.status}: ${body.slice(0, 300)}`);
    throw new Error(`TronGrid returned status ${r.status}.`);
  }
  const j = await safeJson(r, 'TronGrid tx', url);
  if (!j || !j.data || !j.data.length) return null;
  const d = j.data[0];
  const ret = d.ret?.[0]?.contractRet || 'unknown';
  const confirmed = ret === 'SUCCESS';
  const contractData = d.data?.[0] || {};
  // For TRC20 USDT transfers
  let amount = 0;
  let symbol = 'TRX';
  let fromAddr = '';
  let toAddr = '';
  const ct = contractData.contract?.type || '';
  if (ct === 'TransferContract' && contractData.contract?.parameter?.value) {
    const v = contractData.contract.parameter.value;
    fromAddr = v.from || (v.owner_address || '');
    toAddr = v.to || '';
    amount = v.amount ? Number(v.amount) / 1e6 : 0; // TRX uses 6 decimals
    symbol = 'TRX';
  } else if (ct === 'TriggerSmartContract' && contractData.contract?.parameter?.value) {
    // TRC20 transfer — decode the data field for amount.
    const v = contractData.contract.parameter.value;
    fromAddr = v.owner_address || '';
    toAddr = v.to_address || '';
    if (v.contract_address === TRON_USDT_CONTRACT || v.data?.startsWith('a9059cbb')) {
      // TronGrid returns contract_address as a HEX string (e.g. "41a614f8...")
      // whereas TRON_USDT_CONTRACT is base58. The hex comparison above will fail,
      // so we ALSO accept any TriggerSmartContract whose data starts with the
      // ERC20 transfer selector (a9059cbb). The amount is decoded from the data.
      symbol = 'USDT';
      // data: a9059cbb (4 bytes) + 32-byte recipient + 32-byte amount
      const hex = String(v.data || '').slice(8);
      if (hex.length >= 64) {
        const amtHex = hex.slice(32, 64);
        amount = Number(BigInt('0x' + amtHex)) / 1e6;
      }
    }
  }
  return {
    chain: 'Tron',
    chainKey: 'tron',
    hash,
    from: fromAddr,
    to: toAddr,
    inputs: fromAddr ? [{ address: fromAddr, value: amount }] : [],
    outputs: toAddr ? [{ address: toAddr, value: amount }] : [],
    value: amount,
    symbol,
    decimals: 6,
    timestamp: d.block_timestamp ? Number(d.block_timestamp) : null,
    confirmed,
    isError: confirmed ? '0' : '1',
    gasUsed: d.fee ? (Number(d.fee) / 1e6) : null,
    explorerTxUrl: `https://tronscan.org/#/transaction/${hash}`,
  };
}

async function tronFetchBalance(address) {
  if (!config.trongridApiKey) throw new Error('TronGrid API key not configured (set TRONGRID_API_KEY).');
  // Native TRX balance
  const tronWebUrl = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`;
  const r = await fetchWithTimeout(tronWebUrl, { headers: { 'TRON-PRO-API-KEY': config.trongridApiKey } });
  if (!r.ok) {
    if (r.status === 404) return { chain: 'Tron', chainKey: 'tron', address, nativeBalance: 0, nativeSymbol: 'TRX', usdtBalance: 0, usdtSymbol: 'USDT', explorerAddrUrl: `https://tronscan.org/#/address/${address}` };
    throw new Error(`TronGrid returned status ${r.status}.`);
  }
  const j = await safeJson(r, 'TronGrid balance', tronWebUrl);
  const data = (j && j.data && j.data[0]) || {};
  // TRX balance is in sun (1 TRX = 1,000,000 sun), but the v1/accounts endpoint
  // returns balance in sun (integer).
  const nativeBalance = data.balance ? Number(data.balance) / 1e6 : 0;
  // TRC20 token balances — find USDT.
  let usdtBalance = 0;
  const trc20 = data.trc20 || [];
  for (const row of trc20) {
    if (row[TRON_USDT_CONTRACT]) {
      usdtBalance = Number(row[TRON_USDT_CONTRACT]) / 1e6;
      break;
    }
  }
  return {
    chain: 'Tron',
    chainKey: 'tron',
    address,
    nativeBalance,
    nativeSymbol: 'TRX',
    nativeCoinId: 'tron',
    usdtBalance,
    usdtSymbol: 'USDT',
    explorerAddrUrl: `https://tronscan.org/#/address/${address}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Solana (Helius) — RPC + enhanced tx endpoint
// ─────────────────────────────────────────────────────────────────────────────
async function solanaFetchTx(hash) {
  if (!config.heliusApiKey) throw new Error('Helius API key not configured (set HELIUS_API_KEY).');
  // Helius enhanced transactions endpoint (single signature).
  const url = `https://api.helius.xyz/v0/transactions/?api-key=${encodeURIComponent(config.heliusApiKey)}`;
  dbg('solanaFetchTx URL:', redactUrl(url));
  const r = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactions: [hash] }),
  });
  if (!r.ok) {
    const body = await r.text();
    console.error(`[cryptoApi] solanaFetchTx ${r.status}: ${body.slice(0, 300)}`);
    throw new Error(`Helius returned status ${r.status}.`);
  }
  const j = await safeJson(r, 'Helius enhanced tx', url);
  if (!Array.isArray(j) || !j.length) return null;
  const d = j[0];

  // BUG 5 fix: Helius accountKeys are objects { pubkey/account, signer, writable },
  // not plain strings. Extract actual address strings.
  const rawKeys = d.transaction?.message?.accountKeys
    || d.accounts?.map((a) => a.address)
    || [];
  const accountKeys = rawKeys.map((k) =>
    typeof k === 'string' ? k : (k.pubkey || k.account || String(k))
  );

  // Build inputs/outputs from balance changes + token transfers.
  const preBalances = d.meta?.preBalances || [];
  const postBalances = d.meta?.postBalances || [];
  const fee = d.meta?.fee || 0;
  const solInputs = [];
  const solOutputs = [];
  for (let i = 0; i < accountKeys.length; i++) {
    const pre = preBalances[i] ?? 0;
    const post = postBalances[i] ?? 0;
    const addr = accountKeys[i];
    if (i === 0) {
      // Account 0 is the fee payer — deduct fee when comparing.
      const netPost = post + fee; // what their balance would be without paying fee
      if (pre > netPost) {
        solInputs.push({ address: addr, value: (pre - netPost) / 1e9 });
      }
      if (post < pre - fee) {
        // Also record as sender in a simpler form.
      }
    } else {
      if (post > pre) {
        solOutputs.push({ address: addr, value: (post - pre) / 1e9 });
      } else if (pre > post) {
        solInputs.push({ address: addr, value: (pre - post) / 1e9 });
      }
    }
  }

  // Use token transfers for token-specific inputs/outputs.
  const tokenInputs = [];
  const tokenOutputs = [];
  let tokenSymbol = null;
  if (d.tokenTransfers && d.tokenTransfers.length) {
    for (const t of d.tokenTransfers) {
      const amt = t.amount ? Number(t.amount) / Math.pow(10, t.decimals || 6) : 0;
      const fromAddr = t.fromUserAccount || t.source || '';
      const toAddr = t.toUserAccount || t.destination || '';
      if (fromAddr) tokenInputs.push({ address: fromAddr, value: amt, mint: t.mint });
      if (toAddr) tokenOutputs.push({ address: toAddr, value: amt, mint: t.mint });
    }
    tokenSymbol = d.tokenTransfers[0].mint || 'SPL Token';
  }

  const from = accountKeys[0] || '';
  const to = accountKeys.length > 1 ? accountKeys[1] : '';

  // Native SOL transfer — look for instructions of type "transfer".
  let amount = 0;
  let symbol = 'SOL';
  const instructions = d.instructions || d.transaction?.message?.instructions || [];
  for (const ix of instructions) {
    if (ix?.parsed?.type === 'transfer' && ix?.parsed?.info) {
      const info = ix.parsed.info;
      if (info.lamports) {
        amount = Number(info.lamports) / 1e9;
        symbol = 'SOL';
        break;
      }
    }
  }
  // If no native transfer found, check token transfers (for USDT / SPL tokens).
  if (!amount && d.tokenTransfers && d.tokenTransfers.length) {
    const t = d.tokenTransfers[0];
    amount = t.amount ? Number(t.amount) / Math.pow(10, t.decimals || 6) : 0;
    symbol = t.mint || 'SOL';
  }
  const ts = d.timestamp ? d.timestamp * 1000 : (d.blockTime ? d.blockTime * 1000 : null);
  dbg(`solanaFetchTx from=${from} to=${to} amount=${amount} symbol=${symbol} accountKeys=${accountKeys.length}`);
  return {
    chain: 'Solana',
    chainKey: 'solana',
    hash,
    from,
    to,
    inputs: tokenInputs.length ? tokenInputs : solInputs,
    outputs: tokenOutputs.length ? tokenOutputs : solOutputs,
    value: amount,
    symbol,
    decimals: 9,
    timestamp: ts,
    confirmed: !d.meta?.err,
    isError: d.meta?.err ? '1' : '0',
    gasUsed: d.fee ? Number(d.fee) / 1e9 : null,
    explorerTxUrl: `https://solscan.io/tx/${hash}`,
  };
}

async function solanaFetchBalance(address) {
  if (!config.heliusApiKey) throw new Error('Helius API key not configured (set HELIUS_API_KEY).');
  // Use Solana JSON-RPC via Helius for balance.
  const url = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(config.heliusApiKey)}`;
  const r = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
  });
  if (!r.ok) throw new Error(`Helius RPC returned status ${r.status}.`);
  const j = await safeJson(r, 'Helius getBalance', url);
  const lamports = j?.result?.value || 0;
  const nativeBalance = Number(lamports) / 1e9;
  return {
    chain: 'Solana',
    chainKey: 'solana',
    address,
    nativeBalance,
    nativeSymbol: 'SOL',
    nativeCoinId: 'solana',
    usdtBalance: 0,
    usdtSymbol: 'USDT',
    explorerAddrUrl: `https://solscan.io/account/${address}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Litecoin (BlockCypher)
// ─────────────────────────────────────────────────────────────────────────────
async function litecoinFetchTx(hash) {
  if (!config.blockcypherToken) throw new Error('BlockCypher token not configured (set BLOCKCYPHER_TOKEN).');
  const url = `https://api.blockcypher.com/v1/ltc/main/txs/${encodeURIComponent(hash)}?token=${encodeURIComponent(config.blockcypherToken)}`;
  dbg('litecoinFetchTx URL:', redactUrl(url));
  const r = await fetchWithTimeout(url);
  if (!r.ok) {
    if (r.status === 404) return null;
    const body = await r.text();
    console.error(`[cryptoApi] litecoinFetchTx ${r.status}: ${body.slice(0, 300)}`);
    throw new Error(`BlockCypher returned status ${r.status}.`);
  }
  const d = await safeJson(r, 'BlockCypher LTC tx', url);
  if (!d || d.error) return null;

  // BlockCypher returns `total` and `fees` in litoshis (1e-8 LTC).
  const rawTotal = d.total || 0;
  const rawFees = d.fees || 0;
  dbg(`litecoinFetchTx raw total=${rawTotal} fees=${rawFees} (litoshis) → LTC: total=${rawTotal / 1e8} fees=${rawFees / 1e8}`);
  dbg(`litecoinFetchTx vin count=${d.vin?.length || 0} vout count=${d.vout?.length || 0}`);

  // BUG 5 fix: build full inputs/outputs from vin/vout arrays.
  const inputs = (d.vin || []).map((v) => ({
    address: v.addresses?.[0] || '',
    value: v.output_value ? v.output_value / 1e8 : 0,
  }));
  const outputs = (d.vout || []).map((v) => ({
    address: v.addresses?.[0] || '',
    value: v.value ? v.value / 1e8 : 0,
  }));
  dbg(`litecoinFetchTx inputs=${JSON.stringify(inputs)} outputs=${JSON.stringify(outputs)}`);

  // BlockCypher returns vin/vout arrays — pick the first non-change addresses.
  const vin = d.vin?.[0] || {};
  const vout = d.vout?.[0] || {};
  return {
    chain: 'Litecoin',
    chainKey: 'litecoin',
    hash,
    from: vin.addresses?.[0] || '',
    to: vout.addresses?.[0] || '',
    inputs,
    outputs,
    value: rawTotal / 1e8,
    symbol: 'LTC',
    decimals: 8,
    timestamp: d.received ? Date.parse(d.received) : (d.time ? d.time * 1000 : null),
    confirmed: d.confirmations > 0,
    isError: '0',
    gasUsed: rawFees / 1e8,
    explorerTxUrl: `https://live.blockcypher.com/ltc/tx/${hash}/`,
  };
}

async function litecoinFetchBalance(address) {
  if (!config.blockcypherToken) throw new Error('BlockCypher token not configured (set BLOCKCYPHER_TOKEN).');
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${encodeURIComponent(address)}/balance?token=${encodeURIComponent(config.blockcypherToken)}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`BlockCypher returned status ${r.status}.`);
  const j = await safeJson(r, 'BlockCypher LTC balance', url);
  const confirmed = (j.balance || 0) / 1e8;
  const unconfirmed = (j.unconfirmed_balance || 0) / 1e8;
  const total = (j.total_received || 0) === 0 ? confirmed + unconfirmed : (j.final_balance || 0) / 1e8;
  return {
    chain: 'Litecoin',
    chainKey: 'litecoin',
    address,
    nativeBalance: confirmed,
    nativeUnconfirmed: unconfirmed,
    nativeTotal: total,
    nativeSymbol: 'LTC',
    nativeCoinId: 'litecoin',
    usdtBalance: 0,
    usdtSymbol: 'USDT',
    explorerAddrUrl: `https://live.blockcypher.com/ltc/address/${address}/`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Live USD price helper (used to render "Approx. Value" lines).
//  Returns null when no price is available — callers should handle gracefully.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Live USD price helper (used to render "Approx. Value" lines in ?tx and ?bal).
 *
 * BATCHED + CACHED to dodge CoinGecko's aggressive rate limit:
 *   - First call adds the coinId to a pending batch + schedules a 10ms flush.
 *   - Concurrent calls within that 10ms window join the same batch.
 *   - The flush fires ONE /simple/price?ids=a,b,c request for all of them.
 *   - On 429, retries once after a 2s backoff.
 *
 * Returns a finite number on success, or null when no price is available
 * (rate-limited even after retry, unknown coin id, network failure).
 * Callers should render "Price unavailable" when null is returned — NEVER
 * silently coerce to $0, which looks like a valid zero balance.
 *
 * Verbose logging (STEP 2): logs every step when DEBUG env var is set.
 */
async function getUsdPrice(coinId) {
  if (!coinId) {
    dbg('getUsdPrice: called with empty coinId');
    return null;
  }

  // Check cache first.
  const cached = priceCache.get(coinId);
  if (cached && Date.now() < cached.expires) {
    dbg(`getUsdPrice(${coinId}): cache hit, usd=${cached.usd}`);
    return cached.usd; // may be null (negative-cached unknown id)
  }

  // Not cached — queue for batch fetch.
  if (!pendingBatch) {
    pendingBatch = {};
    // Schedule a flush on the next tick. 10ms is enough to coalesce concurrent
    // calls within a single ?tx / ?bal invocation but doesn't add perceptible latency.
    // NOTE: Do NOT .unref() this timer — the pending Promise returned to callers does
    // NOT keep Node.js alive on its own, so unref'ing the timer would let the process
    // exit before the batch flush fires, leaving callers hanging forever.
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushBatch, 10);
  }

  if (!pendingBatch[coinId]) {
    pendingBatch[coinId] = {};
    pendingBatch[coinId].promise = new Promise((resolve, reject) => {
      pendingBatch[coinId].resolve = resolve;
      pendingBatch[coinId].reject = reject;
    });
  }

  try {
    const price = await pendingBatch[coinId].promise;
    dbg(`getUsdPrice(${coinId}): resolved price=${price}`);
    return price;
  } catch (e) {
    console.error(`[cryptoApi] getUsdPrice(${coinId}) failed: ${e.message}`);
    dbg(`getUsdPrice(${coinId}) threw: ${e.message}`);
    return null; // never propagate — callers already handle null as "unavailable"
  }
}

module.exports = {
  // Existing
  getPrice,
  searchCoin,
  convert,
  // Network helpers
  fetchWithTimeout,
  safeJson,
  // FX / detection
  getFxRates,
  isFiat,
  detectTxChain,
  detectAddressChain,
  // EVM
  evmFetchTx,
  evmFetchBalance,
  EVM_CHAINS,
  // Tron
  tronFetchTx,
  tronFetchBalance,
  // Solana
  solanaFetchTx,
  solanaFetchBalance,
  // Litecoin
  litecoinFetchTx,
  litecoinFetchBalance,
  // Pricing
  getUsdPrice,
  // Legacy alias (kept for backward compatibility with any old call sites)
  txidLookup: async function (hash) {
    // Best-effort: tries Polygon, Tron, Solana, Litecoin in order.
    const out = [];
    const detected = detectTxChain(hash);
    try {
      if (detected.type === 'evm' && config.polygonscanApiKey) {
        const r = await evmFetchTx('polygon', hash);
        if (r) out.push({ chain: 'Polygon', data: r });
      }
      if (detected.type === 'hex64' && config.trongridApiKey) {
        try {
          const r = await tronFetchTx(hash);
          if (r) out.push({ chain: 'Tron', data: r });
        } catch { /* ignore */ }
      }
      if (detected.type === 'solana' && config.heliusApiKey) {
        const r = await solanaFetchTx(hash);
        if (r) out.push({ chain: 'Solana', data: r });
      }
      if (detected.type === 'hex64' && config.blockcypherToken) {
        try {
          const r = await litecoinFetchTx(hash);
          if (r) out.push({ chain: 'Litecoin', data: r });
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return out;
  },
};
