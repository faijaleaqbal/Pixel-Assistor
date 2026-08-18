// src/utils/crypto/tokenRegistry.js
// Token registry providing known ERC-20, SPL, and TRC-20 token metadata,
// plus dynamic on-chain metadata resolution for unknown tokens.

const KNOWN_TOKENS = {
  polygon: {
    // USDT (Tether USD)
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    // USDC (Native USDC)
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', decimals: 6, name: 'USD Coin', coinId: 'usd-coin' },
    // USDC.e (Bridged USDC)
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC.e', decimals: 6, name: 'Bridged USD Coin', coinId: 'usd-coin' },
    // DAI
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin', coinId: 'dai' },
    // WETH
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', coinId: 'ethereum' },
    // WBTC
    '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': { symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC', coinId: 'wrapped-bitcoin' },
    // WPOL / WMATIC
    '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': { symbol: 'WMATIC', decimals: 18, name: 'Wrapped Matic', coinId: 'matic-network' },
  },
  ethereum: {
    // USDT
    '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    // USDC
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, name: 'USD Coin', coinId: 'usd-coin' },
    // DAI
    '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin', coinId: 'dai' },
    // WETH
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', coinId: 'ethereum' },
    // WBTC
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC', coinId: 'wrapped-bitcoin' },
  },
  bnb: {
    // USDT (BSC-USD)
    '0x55d398326f99059ff775485246999027b3197955': { symbol: 'USDT', decimals: 18, name: 'Tether USD', coinId: 'tether' },
    // USDC
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { symbol: 'USDC', decimals: 18, name: 'USD Coin', coinId: 'usd-coin' },
    // BUSD
    '0xe9e7cea3dedca5984780bafc599bd69add087d56': { symbol: 'BUSD', decimals: 18, name: 'Binance USD', coinId: 'binance-usd' },
    // DAI
    '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3': { symbol: 'DAI', decimals: 18, name: 'Dai Token', coinId: 'dai' },
    // WBNB
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': { symbol: 'WBNB', decimals: 18, name: 'Wrapped BNB', coinId: 'binancecoin' },
    // ETH
    '0x2170ed0880ac9a755fd29b2688956bd959f933f8': { symbol: 'ETH', decimals: 18, name: 'Ethereum Token', coinId: 'ethereum' },
    // BTCB
    '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c': { symbol: 'BTCB', decimals: 18, name: 'Bitcoin BEP2', coinId: 'bitcoin' },
  },
  arbitrum: {
    // USDT
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    // USDC
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', decimals: 6, name: 'USD Coin', coinId: 'usd-coin' },
    // USDC.e
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': { symbol: 'USDC.e', decimals: 6, name: 'Bridged USDC', coinId: 'usd-coin' },
    // ARB
    '0x912ce59144191c1204e64559fe8253a0e49e6548': { symbol: 'ARB', decimals: 18, name: 'Arbitrum', coinId: 'arbitrum' },
    // WETH
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', coinId: 'ethereum' },
  },
  base: {
    // USDC
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6, name: 'USD Coin', coinId: 'usd-coin' },
    // USDT
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    // DAI (USDbC / DAI)
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { symbol: 'USDbC', decimals: 6, name: 'USD Base Coin', coinId: 'usd-coin' },
    // WETH
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', coinId: 'ethereum' },
  },
  optimism: {
    // USDT
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    // USDC
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', decimals: 6, name: 'USD Coin', coinId: 'usd-coin' },
    // OP
    '0x4200000000000000000000000000000000000042': { symbol: 'OP', decimals: 18, name: 'Optimism', coinId: 'optimism' },
    // WETH
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', coinId: 'ethereum' },
  },
  solana: {
    // USDT
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    // USDC
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6, name: 'USD Coin', coinId: 'usd-coin' },
    // Wrapped SOL
    'So11111111111111111111111111111111111111112': { symbol: 'WSOL', decimals: 9, name: 'Wrapped SOL', coinId: 'solana' },
    // Raydium
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', decimals: 6, name: 'Raydium', coinId: 'raydium' },
  },
  tron: {
    // USDT-TRC20
    'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    '41a614f803b6fd780986a42c78ec9c7f77e6ded13c': { symbol: 'USDT', decimals: 6, name: 'Tether USD', coinId: 'tether' },
    // USDC
    'TE2RzoSV3wFK99w6J9UnnZ4vLfXYoxvuzP': { symbol: 'USDC', decimals: 6, name: 'USD Coin', coinId: 'usd-coin' },
  },
};

// In-memory cache for on-chain resolved metadata
const metadataCache = new Map();

/**
 * Decode hex string returned by ABI eth_call for string or bytes32
 */
function decodeAbiString(hex) {
  if (!hex || hex === '0x' || typeof hex !== 'string') return null;
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean.length) return null;

  try {
    // 1. Standard ABI encoded string (offset at 0..64, length at 64..128, content at 128..)
    if (clean.length >= 128) {
      const lenHex = clean.slice(64, 128);
      const len = parseInt(lenHex, 16);
      if (Number.isFinite(len) && len > 0 && len < 200 && clean.length >= 128 + len * 2) {
        const strHex = clean.slice(128, 128 + len * 2);
        const decoded = Buffer.from(strHex, 'hex').toString('utf8').replace(/\0/g, '').trim();
        if (decoded) return decoded;
      }
    }
    // 2. bytes32 directly (null-padded string e.g. MKR, standard fallback)
    const buf = Buffer.from(clean.slice(0, 64), 'hex');
    const str = buf.toString('utf8').replace(/\0/g, '').trim();
    if (str && /^[\w\s\$\.\-\+\/\:]+$/.test(str)) {
      return str;
    }
  } catch {}
  return null;
}

/**
 * Decode uint8/uint256 returned by ABI eth_call for decimals()
 * Returns integer in range [0, 255] or null if invalid/malformed.
 */
function decodeAbiUint(hex) {
  if (!hex || hex === '0x' || typeof hex !== 'string') return null;
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean.length) return null;

  try {
    const val = BigInt('0x' + clean);
    if (val >= 0n && val <= 255n) {
      return Number(val);
    }
  } catch {}
  return null;
}

/**
 * Resolves token metadata for a contract address on a specific chain.
 * Checks static known tokens first, then cache, then queries on-chain via callRpc.
 * NEVER defaults unknown decimals to 18!
 */
async function resolveTokenMetadata(chainKey, contractAddress, callRpcFn = null) {
  const normAddr = String(contractAddress || '').trim().toLowerCase();
  const cKey = String(chainKey || '').toLowerCase();

  // 1. Static registry
  const chainTokens = KNOWN_TOKENS[cKey];
  if (chainTokens && chainTokens[normAddr]) {
    return { contract: contractAddress, ...chainTokens[normAddr], decimalsUnknown: false };
  }

  // 2. Memory cache
  const cacheKey = `${cKey}:${normAddr}`;
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  let resolvedDecimals = null;
  let resolvedSymbol = null;
  let resolvedName = null;

  // 3. Dynamic on-chain query if callRpcFn provided
  if (callRpcFn && normAddr.startsWith('0x') && normAddr.length === 42) {
    try {
      // decimals() signature: 0x313ce567
      const decRaw = await callRpcFn('eth_call', [{ to: contractAddress, data: '0x313ce567' }, 'latest']).catch(() => null);
      if (decRaw && decRaw !== '0x') {
        const dec = decodeAbiUint(decRaw);
        if (dec !== null) {
          resolvedDecimals = dec;
        }
      }

      // symbol() signature: 0x95d89b41
      const symRaw = await callRpcFn('eth_call', [{ to: contractAddress, data: '0x95d89b41' }, 'latest']).catch(() => null);
      if (symRaw && symRaw !== '0x') {
        const sym = decodeAbiString(symRaw);
        if (sym) {
          resolvedSymbol = sym;
          resolvedName = sym;
        }
      }
    } catch {
      // ignore rpc failure
    }
  }

  const result = {
    contract: contractAddress,
    symbol: resolvedSymbol || 'UNKNOWN_TOKEN',
    decimals: resolvedDecimals, // null if could not be determined — NEVER default to 18!
    decimalsUnknown: resolvedDecimals === null,
    name: resolvedName || 'Unknown Token',
    coinId: null,
  };

  metadataCache.set(cacheKey, result);
  return result;
}

module.exports = {
  KNOWN_TOKENS,
  resolveTokenMetadata,
  decodeAbiString,
  decodeAbiUint,
};
