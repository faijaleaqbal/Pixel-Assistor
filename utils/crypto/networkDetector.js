// src/utils/crypto/networkDetector.js
// Deterministic network detection adhering to priorities:
// Priority A: Explicit network supplied by user
// Priority B: Address-based detection
// Priority C: Hash/signature validation & format detection

const NETWORK_ALIASES = {
  // EVM
  polygon: 'polygon',
  pol: 'polygon',
  matic: 'polygon',
  eth: 'ethereum',
  ethereum: 'ethereum',
  ether: 'ethereum',
  bnb: 'bnb',
  bsc: 'bnb',
  binance: 'bnb',
  arb: 'arbitrum',
  arbitrum: 'arbitrum',
  base: 'base',
  op: 'optimism',
  optimism: 'optimism',

  // Non-EVM
  ltc: 'litecoin',
  litecoin: 'litecoin',
  sol: 'solana',
  solana: 'solana',
  trx: 'tron',
  tron: 'tron',
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
};

const NETWORK_METADATA = {
  polygon: { key: 'polygon', label: 'Polygon', type: 'evm', coinId: 'matic-network', symbol: 'POL' },
  ethereum: { key: 'ethereum', label: 'Ethereum', type: 'evm', coinId: 'ethereum', symbol: 'ETH' },
  bnb: { key: 'bnb', label: 'BNB Chain', type: 'evm', coinId: 'binancecoin', symbol: 'BNB' },
  arbitrum: { key: 'arbitrum', label: 'Arbitrum', type: 'evm', coinId: 'ethereum', symbol: 'ETH' },
  base: { key: 'base', label: 'Base', type: 'evm', coinId: 'ethereum', symbol: 'ETH' },
  optimism: { key: 'optimism', label: 'Optimism', type: 'evm', coinId: 'ethereum', symbol: 'ETH' },
  litecoin: { key: 'litecoin', label: 'Litecoin', type: 'utxo', coinId: 'litecoin', symbol: 'LTC' },
  solana: { key: 'solana', label: 'Solana', type: 'solana', coinId: 'solana', symbol: 'SOL' },
  tron: { key: 'tron', label: 'Tron', type: 'tron', coinId: 'tron', symbol: 'TRX' },
  bitcoin: { key: 'bitcoin', label: 'Bitcoin', type: 'utxo', coinId: 'bitcoin', symbol: 'BTC' },
  dogecoin: { key: 'dogecoin', label: 'Dogecoin', type: 'utxo', coinId: 'dogecoin', symbol: 'DOGE' },
};

// Regex patterns
const EVM_TX_RE = /^0x[0-9a-fA-F]{64}$/;
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX64_RE = /^[0-9a-fA-F]{64}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

// Litecoin addresses
const LTC_BECH32_RE = /^ltc1[a-z0-9]{8,87}$/i;
const LTC_LEGACY_RE = /^L[a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const LTC_M_P2SH_RE = /^M[a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const P2SH_3_RE = /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/;

// Tron addresses
const TRON_ADDR_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

// Bitcoin addresses
const BTC_BECH32_RE = /^bc1[a-z0-9]{8,87}$/i;
const BTC_LEGACY_RE = /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/;

// Dogecoin addresses (starts with D, A, or 9; standard 34 chars)
const DOGE_ADDR_RE = /^D{1}[5-9A-HJ-NP-U]{1}[1-9A-HJ-NP-Za-km-z]{32}$|^[A9]{1}[1-9A-HJ-NP-Za-km-z]{33}$/;

/**
 * Resolves user-provided network string to canonical network key.
 */
function normalizeNetworkName(input) {
  if (!input) return null;
  const clean = String(input).toLowerCase().trim();
  return NETWORK_ALIASES[clean] || null;
}

/**
 * Detects network candidates based on wallet address.
 */
function detectAddressNetwork(addr) {
  const a = String(addr || '').trim();
  if (!a) return { type: 'unknown', candidates: [] };

  if (EVM_ADDR_RE.test(a)) {
    return {
      type: 'evm',
      ambiguous: true,
      candidates: ['polygon', 'bnb', 'ethereum', 'arbitrum', 'base', 'optimism'],
    };
  }

  if (TRON_ADDR_RE.test(a)) {
    return { type: 'tron', candidates: ['tron'] };
  }

  if (DOGE_ADDR_RE.test(a)) {
    return { type: 'dogecoin', candidates: ['dogecoin'] };
  }

  if (LTC_BECH32_RE.test(a) || LTC_LEGACY_RE.test(a) || LTC_M_P2SH_RE.test(a)) {
    return { type: 'litecoin', candidates: ['litecoin'] };
  }

  if (BTC_BECH32_RE.test(a) || BTC_LEGACY_RE.test(a)) {
    return { type: 'bitcoin', candidates: ['bitcoin'] };
  }

  // "3..." addresses are used by both Litecoin and Bitcoin P2SH
  if (P2SH_3_RE.test(a)) {
    return { type: 'utxo_p2sh', ambiguous: true, candidates: ['bitcoin', 'litecoin'] };
  }

  // Solana public key is base58, 32-44 characters
  if (BASE58_RE.test(a) && a.length >= 32 && a.length <= 44) {
    return { type: 'solana', candidates: ['solana'] };
  }

  return { type: 'unknown', candidates: [] };
}

/**
 * Detects network candidates based on transaction hash/signature format.
 */
function detectTxFormat(txIdentifier) {
  const s = String(txIdentifier || '').trim();
  if (!s) return { type: 'unknown', candidates: [] };

  // 1. EVM Hash: 0x + 64 hex chars (66 chars total)
  if (EVM_TX_RE.test(s)) {
    return {
      type: 'evm',
      ambiguous: true,
      candidates: ['polygon', 'bnb', 'ethereum', 'arbitrum', 'base', 'optimism'],
    };
  }

  // 2. Solana Signature: Base58 string 80-90 chars (standard is 87-88 chars, 64-byte signature)
  // A 64-character hex string MUST NEVER be treated as a Solana signature!
  if (BASE58_RE.test(s) && s.length >= 80 && s.length <= 90 && !HEX64_RE.test(s)) {
    return {
      type: 'solana',
      ambiguous: false,
      candidates: ['solana'],
    };
  }

  // 3. 64-character Hexadecimal string (without 0x prefix):
  // Belong to UTXO chains (Bitcoin, Litecoin, Dogecoin) or Tron. NEVER Solana.
  if (HEX64_RE.test(s)) {
    return {
      type: 'hex64',
      ambiguous: true,
      candidates: ['bitcoin', 'litecoin', 'dogecoin', 'tron'],
    };
  }

  return { type: 'unknown', candidates: [] };
}

/**
 * Parses command input tokens to extract explicit network, hash, and optional address.
 */
function parseTxCommandInput(args = []) {
  if (!args || !args.length) return { explicitNetwork: null, txIdentifier: '', walletAddress: null };

  const tokens = args.map((a) => String(a).trim()).filter(Boolean);
  if (!tokens.length) return { explicitNetwork: null, txIdentifier: '', walletAddress: null };

  let explicitNetwork = null;
  let txIdentifier = '';
  let walletAddress = null;

  // Check if token 0 is a known network name
  const net0 = normalizeNetworkName(tokens[0]);
  if (net0) {
    explicitNetwork = net0;
    txIdentifier = tokens[1] || '';
    walletAddress = tokens[2] || null;
  } else {
    // Check if token 1 is a known network name (e.g. `tx <hash> <network>`)
    const net1 = tokens[1] ? normalizeNetworkName(tokens[1]) : null;
    if (net1) {
      explicitNetwork = net1;
      txIdentifier = tokens[0];
      walletAddress = tokens[2] || null;
    } else {
      // No explicit network token
      txIdentifier = tokens[0];
      // Token 1 could be a wallet address
      if (tokens[1]) {
        walletAddress = tokens[1];
      }
    }
  }

  return { explicitNetwork, txIdentifier, walletAddress };
}

module.exports = {
  NETWORK_ALIASES,
  NETWORK_METADATA,
  normalizeNetworkName,
  detectAddressNetwork,
  detectTxFormat,
  parseTxCommandInput,
};
