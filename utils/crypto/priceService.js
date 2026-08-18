// src/utils/crypto/priceService.js
// Price enrichment service using batched CoinGecko queries with caching and fallback handling.

const config = require('../config');

const CG_BASE = config.coingeckoApiKey
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

const SYMBOL_TO_COINGECKO_ID = {
  btc: 'bitcoin',
  wbtc: 'bitcoin',
  btcb: 'bitcoin',
  eth: 'ethereum',
  weth: 'ethereum',
  pol: 'matic-network',
  matic: 'matic-network',
  wmatic: 'matic-network',
  bnb: 'binancecoin',
  wbnb: 'binancecoin',
  sol: 'solana',
  wsol: 'solana',
  ltc: 'litecoin',
  trx: 'tron',
  usdt: 'tether',
  usdc: 'usd-coin',
  'usdc.e': 'usd-coin',
  usdbc: 'usd-coin',
  dai: 'dai',
  busd: 'binance-usd',
  arb: 'arbitrum',
  op: 'optimism',
  ray: 'raydium',
};

const priceCache = new Map(); // coinId -> { usd: number | null, expires: number }
const CACHE_TTL = 60_000; // 60s cache

let pendingBatch = null;
let flushTimer = null;

function getCoinIdForSymbol(symbol, fallbackCoinId = null) {
  if (!symbol) return fallbackCoinId;
  const s = String(symbol).toLowerCase().trim();
  return SYMBOL_TO_COINGECKO_ID[s] || fallbackCoinId || s;
}

function cgHeaders() {
  const h = { accept: 'application/json' };
  if (config.coingeckoApiKey) {
    h['x-cg-pro-api-key'] = config.coingeckoApiKey;
  } else if (config.coingeckoDemoApiKey) {
    h['x-cg-demo-api-key'] = config.coingeckoDemoApiKey;
  }
  return h;
}

async function fetchBatchPrices(coinIds) {
  const unique = [...new Set(coinIds.filter((id) => id && !priceCache.has(id)))];
  if (!unique.length) return {};

  const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(unique.join(','))}&vs_currencies=usd`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers: cgHeaders(), signal: controller.signal }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return {};
    }

    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object') return {};

    const now = Date.now();
    for (const id of unique) {
      const usd = json[id]?.usd;
      if (typeof usd === 'number' && Number.isFinite(usd)) {
        priceCache.set(id, { usd, expires: now + CACHE_TTL });
      } else {
        priceCache.set(id, { usd: null, expires: now + 30_000 });
      }
    }
    return json;
  } catch {
    return {};
  }
}

async function flushBatch() {
  const batch = pendingBatch;
  pendingBatch = null;
  flushTimer = null;
  if (!batch) return;

  const ids = Object.keys(batch);
  try {
    await fetchBatchPrices(ids);
    for (const id of ids) {
      const entry = priceCache.get(id);
      const price = entry ? entry.usd : null;
      batch[id].resolve(price);
    }
  } catch (err) {
    for (const id of ids) {
      batch[id].resolve(null);
    }
  }
}

/**
 * Get USD price for a CoinGecko coin ID. Returns null if unavailable.
 */
async function getUsdPrice(coinId) {
  if (!coinId) return null;
  const id = String(coinId).toLowerCase().trim();

  // Stablecoins fallback: USDT / USDC are always pegged close to $1
  const isUsdt = id === 'tether' || id === 'usdt';
  const isUsdc = id === 'usd-coin' || id === 'usdc';

  const cached = priceCache.get(id);
  if (cached && Date.now() < cached.expires) {
    if (cached.usd != null) return cached.usd;
    if (isUsdt || isUsdc) return 1.0;
    return null;
  }

  if (!pendingBatch) {
    pendingBatch = {};
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushBatch, 15);
  }

  if (!pendingBatch[id]) {
    pendingBatch[id] = {};
    pendingBatch[id].promise = new Promise((resolve) => {
      pendingBatch[id].resolve = resolve;
    });
  }

  try {
    const price = await pendingBatch[id].promise;
    if (price != null) return price;
    if (isUsdt || isUsdc) return 1.0;
    return null;
  } catch {
    if (isUsdt || isUsdc) return 1.0;
    return null;
  }
}

/**
 * Enriches normalized Transaction object with USD values.
 */
async function enrichTransactionWithPrices(tx) {
  if (!tx || typeof tx !== 'object') return tx;

  // 1. Primary Asset Price
  if (tx.primaryAsset && tx.primaryAsset.symbol) {
    const coinId = getCoinIdForSymbol(tx.primaryAsset.symbol, tx.primaryAsset.coinId);
    const price = await getUsdPrice(coinId);
    if (price != null && Number.isFinite(price) && tx.primaryAsset.amount != null) {
      tx.primaryAsset.usdValue = tx.primaryAsset.amount * price;
    } else {
      tx.primaryAsset.usdValue = null;
    }
  }

  // 2. Fee USD value
  if (tx.fee && tx.fee.symbol && tx.fee.amount > 0) {
    const feeCoinId = getCoinIdForSymbol(tx.fee.symbol);
    const feePrice = await getUsdPrice(feeCoinId);
    if (feePrice != null && Number.isFinite(feePrice)) {
      tx.fee.usdValue = tx.fee.amount * feePrice;
    }
  }

  // 3. User Context USD value
  if (tx.userContext && tx.userContext.symbol && tx.userContext.amount > 0) {
    const userCoinId = getCoinIdForSymbol(tx.userContext.symbol);
    const userPrice = await getUsdPrice(userCoinId);
    if (userPrice != null && Number.isFinite(userPrice)) {
      tx.userContext.usdValue = tx.userContext.amount * userPrice;
    }
  }

  // 4. Token Transfers USD values
  for (const t of tx.tokenTransfers) {
    const tokenCoinId = getCoinIdForSymbol(t.symbol, t.coinId);
    const p = await getUsdPrice(tokenCoinId);
    if (p != null && Number.isFinite(p) && t.amount != null) {
      t.usdValue = t.amount * p;
    }
  }

  // 5. Native Transfers USD values
  for (const n of tx.nativeTransfers) {
    const nativeCoinId = getCoinIdForSymbol(n.symbol);
    const p = await getUsdPrice(nativeCoinId);
    if (p != null && Number.isFinite(p) && n.amount != null) {
      n.usdValue = n.amount * p;
    }
  }

  return tx;
}

module.exports = {
  getUsdPrice,
  getCoinIdForSymbol,
  enrichTransactionWithPrices,
  SYMBOL_TO_COINGECKO_ID,
};
