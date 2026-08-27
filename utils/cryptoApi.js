// src/utils/cryptoApi.js
// Crypto API facade integrating coin pricing, FX rates, balance lookups,
// and the new multi-chain transaction parser architecture.

const config = require('./config');
const {
  parseTransaction,
  getEvmParser,
  ltcParser,
  btcParser,
  dogeParser,
  solParser,
  tronParser,
  detectAddressNetwork,
  detectTxFormat,
  getUsdPrice,
  EVM_CHAINS,
} = require('./crypto');

const CG = config.coingeckoApiKey
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

const FETCH_TIMEOUT = 10_000;

function cgHeaders() {
  const h = { accept: 'application/json' };
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

async function safeJson(r, label = 'API') {
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json') && !ct.includes('text/json')) {
    throw new Error(`${label} returned non-JSON response.`);
  }
  try {
    return await r.json();
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
}

async function getPrice(coin) {
  const url = `${CG}/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd,eur,inr&include_24hr_change=true`;
  const r = await fetchWithTimeout(url, { headers: cgHeaders() });
  if (r.status === 429) throw new Error('CoinGecko rate limit hit. Wait a few seconds and try again.');
  if (!r.ok) throw new Error(`CoinGecko returned status ${r.status}.`);
  const j = await safeJson(r, 'CoinGecko getPrice', url);
  if (!j[coin]) throw new Error(`Unknown coin id: "${coin}".`);
  return j[coin];
}

async function searchCoin(query) {
  if (!query || !query.trim()) throw new Error('Empty search query.');
  const url = `${CG}/search?query=${encodeURIComponent(query)}`;
  const r = await fetchWithTimeout(url, { headers: cgHeaders() });
  if (r.status === 429) throw new Error('CoinGecko rate limit hit. Wait a moment and try again.');
  if (!r.ok) throw new Error(`CoinGecko search returned status ${r.status}.`);
  const j = await safeJson(r, 'CoinGecko searchCoin', url);
  return (j.coins || []).slice(0, 5);
}

// Fiat FX Rates
const fxCache = { data: null, expires: 0 };
async function getFxRates() {
  if (fxCache.data && Date.now() < fxCache.expires) return fxCache.data;
  const base = (config.fxApiBase || 'https://open.er-api.com/v6').replace(/\/+$/, '');
  const url = `${base}/latest/USD`;
  const r = await fetchWithTimeout(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`FX rates API returned status ${r.status}.`);
  const j = await safeJson(r, 'FX rates', url);
  if (!j || !j.rates) throw new Error('FX rates API returned unexpected payload.');
  fxCache.data = j.rates;
  fxCache.expires = Date.now() + 5 * 60_000;
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

const CG_MAP = {
  btc: 'bitcoin', eth: 'ethereum', usdt: 'tether', usdc: 'usd-coin', sol: 'solana',
  matic: 'matic-network', pol: 'matic-network', ada: 'cardano', xrp: 'ripple',
  doge: 'dogecoin', ltc: 'litecoin', trx: 'tron', bnb: 'binancecoin',
};
function cgId(ticker) {
  const t = String(ticker || '').toLowerCase();
  return CG_MAP[t] || t;
}

async function convert(amount, from, to) {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be a non-negative number.');
  const f = String(from || '').toLowerCase();
  const t = String(to || '').toLowerCase();
  if (!f || !t) throw new Error('Both base and target currencies must be provided.');
  if (f === t) return amount;

  const fromFiat = isFiat(f);
  const toFiat = isFiat(t);

  if (fromFiat && toFiat) {
    const rates = await getFxRates();
    const usdFrom = f === 'usd' ? 1 : (rates[f.toUpperCase()] || rates[f]);
    const usdTo = t === 'usd' ? 1 : (rates[t.toUpperCase()] || rates[t]);
    if (!usdFrom) throw new Error(`Fiat currency "${f.toUpperCase()}" is not supported.`);
    if (!usdTo) throw new Error(`Fiat currency "${t.toUpperCase()}" is not supported.`);
    return (amount / usdFrom) * usdTo;
  }

  if (!fromFiat && !toFiat) {
    const fid = cgId(f);
    const tid = cgId(t);
    const fData = await getPrice(fid);
    const tData = await getPrice(tid);
    if (!fData?.usd) throw new Error(`Could not get USD price for ${f.toUpperCase()}.`);
    if (!tData?.usd) throw new Error(`Could not get USD price for ${t.toUpperCase()}.`);
    return (amount * fData.usd) / tData.usd;
  }

  if (fromFiat && !toFiat) {
    const rates = await getFxRates();
    const usdFrom = f === 'usd' ? 1 : (rates[f.toUpperCase()] || rates[f]);
    if (!usdFrom) throw new Error(`Fiat currency "${f.toUpperCase()}" is not supported.`);
    const usdAmount = amount / usdFrom;
    const tData = await getPrice(cgId(t));
    if (!tData?.usd) throw new Error(`Could not get USD price for ${t.toUpperCase()}.`);
    return usdAmount / tData.usd;
  }

  const fData = await getPrice(cgId(f));
  if (!fData?.usd) throw new Error(`Could not get USD price for ${f.toUpperCase()}.`);
  const usdAmount = amount * fData.usd;
  if (t === 'usd') return usdAmount;
  const rates = await getFxRates();
  const usdTo = rates[t.toUpperCase()] || rates[t];
  if (!usdTo) throw new Error(`Fiat currency "${t.toUpperCase()}" is not supported.`);
  return usdAmount * usdTo;
}

// ── Balance helpers ──

async function evmFetchBalance(chainKey, address) {
  const chain = EVM_CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown EVM chain: ${chainKey}`);

  const { callRpc } = require('./crypto/parsers/evmParser');
  const { KNOWN_TOKENS } = require('./crypto/tokenRegistry');

  let nativeBalance = 0;
  const rawNative = await callRpc(chainKey, 'eth_getBalance', [address, 'latest']).catch(() => null);
  if (rawNative) {
    nativeBalance = Number(BigInt(rawNative)) / 1e18;
  }

  // Query top known tokens in parallel
  const tokens = KNOWN_TOKENS[chainKey] || {};
  const tokenBalances = [];
  let usdtBalance = 0;

  const cleanAddr = address.toLowerCase().replace('0x', '').padStart(64, '0');
  const tokenEntries = Object.entries(tokens);

  const promises = tokenEntries.map(async ([cAddr, meta]) => {
    try {
      const rawBal = await callRpc(chainKey, 'eth_call', [{ to: cAddr, data: '0x70a08231' + cleanAddr }, 'latest']).catch(() => null);
      if (rawBal && rawBal !== '0x') {
        const val = Number(BigInt(rawBal)) / Math.pow(10, meta.decimals || 18);
        if (val > 0) {
          return {
            symbol: meta.symbol,
            name: meta.name,
            decimals: meta.decimals,
            coinId: meta.coinId,
            contract: cAddr,
            balance: val,
          };
        }
      }
    } catch {}
    return null;
  });

  const settled = await Promise.allSettled(promises);
  for (const res of settled) {
    if (res.status === 'fulfilled' && res.value) {
      tokenBalances.push(res.value);
      if (res.value.symbol === 'USDT') {
        usdtBalance = res.value.balance;
      }
    }
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
    tokenBalances,
    explorerAddrUrl: `${chain.explorerUrl}/address/${address}`,
  };
}

async function tronFetchBalance(address) {
  if (!config.trongridApiKey) throw new Error('TronGrid API key not configured.');
  const url = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`;
  const r = await fetchWithTimeout(url, { headers: { 'TRON-PRO-API-KEY': config.trongridApiKey } });
  if (!r.ok) {
    if (r.status === 404) {
      return {
        chain: 'Tron',
        chainKey: 'tron',
        address,
        nativeBalance: 0,
        nativeSymbol: 'TRX',
        nativeCoinId: 'tron',
        usdtBalance: 0,
        usdtSymbol: 'USDT',
        tokenBalances: [],
        explorerAddrUrl: `https://tronscan.org/#/address/${address}`,
      };
    }
    throw new Error(`TronGrid returned status ${r.status}.`);
  }
  const j = await safeJson(r, 'TronGrid balance', url);
  const data = (j && j.data && j.data[0]) || {};
  const nativeBalance = data.balance ? Number(data.balance) / 1e6 : 0;
  
  let usdtBalance = 0;
  const tokenBalances = [];
  const trc20 = data.trc20 || [];

  const { KNOWN_TOKENS } = require('./crypto/tokenRegistry');
  const tronTokens = KNOWN_TOKENS.tron || {};

  for (const row of trc20) {
    for (const [contractAddr, rawVal] of Object.entries(row)) {
      const meta = tronTokens[contractAddr] || { symbol: 'TRC20', decimals: 6, coinId: null };
      const bal = Number(rawVal) / Math.pow(10, meta.decimals || 6);
      if (bal > 0) {
        tokenBalances.push({
          symbol: meta.symbol,
          name: meta.name || meta.symbol,
          decimals: meta.decimals,
          coinId: meta.coinId,
          contract: contractAddr,
          balance: bal,
        });
        if (meta.symbol === 'USDT' || contractAddr === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') {
          usdtBalance = bal;
        }
      }
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
    tokenBalances,
    explorerAddrUrl: `https://tronscan.org/#/address/${address}`,
  };
}

async function solanaFetchBalance(address) {
  const { callSolanaRpc } = require('./crypto/parsers/solanaParser');
  const { KNOWN_TOKENS } = require('./crypto/tokenRegistry');
  const solTokens = KNOWN_TOKENS.solana || {};

  const res = await callSolanaRpc('getBalance', [address]);
  const lamports = res?.value || 0;
  const nativeBalance = Number(lamports) / 1e9;

  let usdtBalance = 0;
  const tokenBalances = [];

  // Fetch all SPL token accounts owned by this wallet
  try {
    const tokenAccounts = await callSolanaRpc('getTokenAccountsByOwner', [
      address,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed' },
    ]);

    if (tokenAccounts && Array.isArray(tokenAccounts.value)) {
      for (const item of tokenAccounts.value) {
        const parsed = item?.account?.data?.parsed?.info;
        if (parsed) {
          const mint = parsed.mint;
          const tokenAmount = parsed.tokenAmount;
          const uiAmount = tokenAmount?.uiAmount;
          if (uiAmount && uiAmount > 0) {
            const meta = solTokens[mint] || { symbol: 'SPL', decimals: tokenAmount.decimals, coinId: null };
            tokenBalances.push({
              symbol: meta.symbol,
              name: meta.name || meta.symbol,
              decimals: tokenAmount.decimals,
              coinId: meta.coinId,
              contract: mint,
              balance: uiAmount,
            });
            if (meta.symbol === 'USDT') {
              usdtBalance = uiAmount;
            }
          }
        }
      }
    }
  } catch {}

  return {
    chain: 'Solana',
    chainKey: 'solana',
    address,
    nativeBalance,
    nativeSymbol: 'SOL',
    nativeCoinId: 'solana',
    usdtBalance,
    usdtSymbol: 'USDT',
    tokenBalances,
    explorerAddrUrl: `https://solscan.io/account/${address}`,
  };
}

async function bitcoinFetchBalance(address) {
  let confirmed = 0;
  let unconfirmed = 0;
  let total = 0;

  // 1. Try Mempool.space
  try {
    const mUrl = `https://mempool.space/api/address/${encodeURIComponent(address)}`;
    const r = await fetchWithTimeout(mUrl);
    if (r.ok) {
      const j = await safeJson(r, 'Mempool.space BTC balance', mUrl);
      const chainStats = j.chain_stats || {};
      const mempoolStats = j.mempool_stats || {};

      const funded = BigInt(chainStats.funded_txo_sum || 0);
      const spent = BigInt(chainStats.spent_txo_sum || 0);
      const confSats = funded >= spent ? funded - spent : 0n;

      const mempoolFunded = BigInt(mempoolStats.funded_txo_sum || 0);
      const mempoolSpent = BigInt(mempoolStats.spent_txo_sum || 0);
      const unconfSats = mempoolFunded >= mempoolSpent ? mempoolFunded - mempoolSpent : 0n;

      confirmed = Number(confSats) / 1e8;
      unconfirmed = Number(unconfSats) / 1e8;
      total = confirmed + unconfirmed;

      return {
        chain: 'Bitcoin',
        chainKey: 'bitcoin',
        address,
        nativeBalance: confirmed,
        nativeUnconfirmed: unconfirmed,
        nativeTotal: total,
        nativeSymbol: 'BTC',
        nativeCoinId: 'bitcoin',
        usdtBalance: 0,
        tokenBalances: [],
        explorerAddrUrl: `https://mempool.space/address/${address}`,
      };
    }
  } catch {}

  // 2. Try BlockCypher
  try {
    const tokenParam = config.blockcypherToken ? `?token=${encodeURIComponent(config.blockcypherToken)}` : '';
    const url = `https://api.blockcypher.com/v1/btc/main/addrs/${encodeURIComponent(address)}/balance${tokenParam}`;
    const r = await fetchWithTimeout(url);
    if (r.ok) {
      const j = await safeJson(r, 'BlockCypher BTC balance', url);
      confirmed = (j.balance || 0) / 1e8;
      unconfirmed = (j.unconfirmed_balance || 0) / 1e8;
      total = (j.total_received || 0) === 0 ? confirmed + unconfirmed : (j.final_balance || 0) / 1e8;
      return {
        chain: 'Bitcoin',
        chainKey: 'bitcoin',
        address,
        nativeBalance: confirmed,
        nativeUnconfirmed: unconfirmed,
        nativeTotal: total,
        nativeSymbol: 'BTC',
        nativeCoinId: 'bitcoin',
        usdtBalance: 0,
        tokenBalances: [],
        explorerAddrUrl: `https://mempool.space/address/${address}`,
      };
    }
  } catch {}

  // 3. Try Blockchair fallback
  const bcUrl = `https://api.blockchair.com/bitcoin/dashboards/address/${encodeURIComponent(address)}`;
  const r2 = await fetchWithTimeout(bcUrl).catch(() => null);
  if (r2 && r2.ok) {
    const j2 = await safeJson(r2, 'Blockchair BTC balance', bcUrl);
    const data = j2?.data?.[address]?.address;
    if (data) {
      const bal = (data.balance || 0) / 1e8;
      return {
        chain: 'Bitcoin',
        chainKey: 'bitcoin',
        address,
        nativeBalance: bal,
        nativeUnconfirmed: 0,
        nativeTotal: bal,
        nativeSymbol: 'BTC',
        nativeCoinId: 'bitcoin',
        usdtBalance: 0,
        tokenBalances: [],
        explorerAddrUrl: `https://mempool.space/address/${address}`,
      };
    }
  }

  throw new Error('Failed to fetch Bitcoin balance from all endpoints.');
}

async function dogecoinFetchBalance(address) {
  let confirmed = 0;
  let unconfirmed = 0;
  let total = 0;

  // 1. Try Blockchair
  try {
    const bcUrl = `https://api.blockchair.com/dogecoin/dashboards/address/${encodeURIComponent(address)}`;
    const r = await fetchWithTimeout(bcUrl);
    if (r.ok) {
      const j = await safeJson(r, 'Blockchair DOGE balance', bcUrl);
      const data = j?.data?.[address]?.address;
      if (data) {
        const bal = (data.balance || 0) / 1e8;
        return {
          chain: 'Dogecoin',
          chainKey: 'dogecoin',
          address,
          nativeBalance: bal,
          nativeUnconfirmed: 0,
          nativeTotal: bal,
          nativeSymbol: 'DOGE',
          nativeCoinId: 'dogecoin',
          usdtBalance: 0,
          tokenBalances: [],
          explorerAddrUrl: `https://blockchair.com/dogecoin/address/${address}`,
        };
      }
    }
  } catch {}

  // 2. Try BlockCypher
  const tokenParam = config.blockcypherToken ? `?token=${encodeURIComponent(config.blockcypherToken)}` : '';
  const url = `https://api.blockcypher.com/v1/doge/main/addrs/${encodeURIComponent(address)}/balance${tokenParam}`;
  const r2 = await fetchWithTimeout(url);
  if (r2.ok) {
    const j = await safeJson(r2, 'BlockCypher DOGE balance', url);
    confirmed = (j.balance || 0) / 1e8;
    unconfirmed = (j.unconfirmed_balance || 0) / 1e8;
    total = (j.total_received || 0) === 0 ? confirmed + unconfirmed : (j.final_balance || 0) / 1e8;
    return {
      chain: 'Dogecoin',
      chainKey: 'dogecoin',
      address,
      nativeBalance: confirmed,
      nativeUnconfirmed: unconfirmed,
      nativeTotal: total,
      nativeSymbol: 'DOGE',
      nativeCoinId: 'dogecoin',
      usdtBalance: 0,
      tokenBalances: [],
      explorerAddrUrl: `https://blockchair.com/dogecoin/address/${address}`,
    };
  }

  throw new Error('Failed to fetch Dogecoin balance from all endpoints.');
}

async function litecoinFetchBalance(address) {
  const tokenParam = config.blockcypherToken ? `?token=${encodeURIComponent(config.blockcypherToken)}` : '';
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${encodeURIComponent(address)}/balance${tokenParam}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) {
    // Try Blockchair fallback
    const bcUrl = `https://api.blockchair.com/litecoin/dashboards/address/${encodeURIComponent(address)}`;
    const r2 = await fetchWithTimeout(bcUrl).catch(() => null);
    if (r2 && r2.ok) {
      const j2 = await safeJson(r2, 'Blockchair balance', bcUrl);
      const data = j2?.data?.[address]?.address;
      if (data) {
        const bal = (data.balance || 0) / 1e8;
        return {
          chain: 'Litecoin',
          chainKey: 'litecoin',
          address,
          nativeBalance: bal,
          nativeUnconfirmed: 0,
          nativeTotal: bal,
          nativeSymbol: 'LTC',
          nativeCoinId: 'litecoin',
          usdtBalance: 0,
          tokenBalances: [],
          explorerAddrUrl: `https://blockchair.com/litecoin/address/${address}`,
        };
      }
    }
    throw new Error(`BlockCypher returned status ${r.status}.`);
  }
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
    tokenBalances: [],
    explorerAddrUrl: `https://blockchair.com/litecoin/address/${address}`,
  };
}

// ── Legacy Parsers Mapping for Backward Compatibility ──

async function evmFetchTx(chainKey, hash, options = {}) {
  const parser = getEvmParser(chainKey);
  const tx = await parser.parse(hash, options);
  if (!tx) return null;
  return {
    chain: tx.network,
    chainKey: tx.networkKey,
    hash: tx.txHash,
    from: tx.inputs[0]?.address || tx.tokenTransfers[0]?.from || '',
    to: tx.outputs[0]?.address || tx.tokenTransfers[0]?.to || '',
    inputs: tx.inputs,
    outputs: tx.outputs,
    value: tx.primaryAsset.amount,
    symbol: tx.primaryAsset.symbol,
    decimals: 18,
    timestamp: tx.timestamp,
    confirmed: tx.status === 'confirmed',
    isError: tx.status === 'confirmed' ? '0' : '1',
    gasUsed: tx.fee.amount,
    explorerTxUrl: tx.explorerTxUrl,
    tokenTransfers: tx.tokenTransfers,
    nativeTransfers: tx.nativeTransfers,
  };
}

async function litecoinFetchTx(hash, options = {}) {
  const tx = await ltcParser.parse(hash, options);
  if (!tx) return null;
  return {
    chain: tx.network,
    chainKey: tx.networkKey,
    hash: tx.txHash,
    from: tx.inputs[0]?.address || '',
    to: tx.outputs[0]?.address || '',
    inputs: tx.inputs,
    outputs: tx.outputs,
    value: tx.primaryAsset.amount,
    symbol: 'LTC',
    decimals: 8,
    timestamp: tx.timestamp,
    confirmed: tx.status === 'confirmed',
    isError: '0',
    gasUsed: tx.fee.amount,
    explorerTxUrl: tx.explorerTxUrl,
  };
}

async function bitcoinFetchTx(hash, options = {}) {
  const tx = await btcParser.parse(hash, options);
  if (!tx) return null;
  return {
    chain: tx.network,
    chainKey: tx.networkKey,
    hash: tx.txHash,
    from: tx.inputs[0]?.address || '',
    to: tx.outputs[0]?.address || '',
    inputs: tx.inputs,
    outputs: tx.outputs,
    value: tx.primaryAsset.amount,
    symbol: 'BTC',
    decimals: 8,
    timestamp: tx.timestamp,
    confirmed: tx.status === 'confirmed',
    isError: '0',
    gasUsed: tx.fee.amount,
    explorerTxUrl: tx.explorerTxUrl,
  };
}

async function dogecoinFetchTx(hash, options = {}) {
  const tx = await dogeParser.parse(hash, options);
  if (!tx) return null;
  return {
    chain: tx.network,
    chainKey: tx.networkKey,
    hash: tx.txHash,
    from: tx.inputs[0]?.address || '',
    to: tx.outputs[0]?.address || '',
    inputs: tx.inputs,
    outputs: tx.outputs,
    value: tx.primaryAsset.amount,
    symbol: 'DOGE',
    decimals: 8,
    timestamp: tx.timestamp,
    confirmed: tx.status === 'confirmed',
    isError: '0',
    gasUsed: tx.fee.amount,
    explorerTxUrl: tx.explorerTxUrl,
  };
}

async function solanaFetchTx(hash, options = {}) {
  const tx = await solParser.parse(hash, options);
  if (!tx) return null;
  return {
    chain: tx.network,
    chainKey: tx.networkKey,
    hash: tx.txHash,
    from: tx.inputs[0]?.address || '',
    to: tx.outputs[0]?.address || '',
    inputs: tx.inputs,
    outputs: tx.outputs,
    value: tx.primaryAsset.amount,
    symbol: tx.primaryAsset.symbol,
    decimals: 9,
    timestamp: tx.timestamp,
    confirmed: tx.status === 'confirmed',
    isError: tx.status === 'confirmed' ? '0' : '1',
    gasUsed: tx.fee.amount,
    explorerTxUrl: tx.explorerTxUrl,
    tokenTransfers: tx.tokenTransfers,
  };
}

async function tronFetchTx(hash, options = {}) {
  const tx = await tronParser.parse(hash, options);
  if (!tx) return null;
  return {
    chain: tx.network,
    chainKey: tx.networkKey,
    hash: tx.txHash,
    from: tx.inputs[0]?.address || '',
    to: tx.outputs[0]?.address || '',
    inputs: tx.inputs,
    outputs: tx.outputs,
    value: tx.primaryAsset.amount,
    symbol: tx.primaryAsset.symbol,
    decimals: 6,
    timestamp: tx.timestamp,
    confirmed: tx.status === 'confirmed',
    isError: tx.status === 'confirmed' ? '0' : '1',
    gasUsed: tx.fee.amount,
    explorerTxUrl: tx.explorerTxUrl,
  };
}

module.exports = {
  getPrice,
  searchCoin,
  convert,
  fetchWithTimeout,
  safeJson,
  getFxRates,
  isFiat,
  detectTxChain: detectTxFormat,
  detectAddressChain: detectAddressNetwork,
  evmFetchTx,
  evmFetchBalance,
  EVM_CHAINS,
  tronFetchTx,
  tronFetchBalance,
  solanaFetchTx,
  solanaFetchBalance,
  litecoinFetchTx,
  litecoinFetchBalance,
  bitcoinFetchTx,
  bitcoinFetchBalance,
  dogecoinFetchTx,
  dogecoinFetchBalance,
  getUsdPrice,
  parseTransaction,
};
