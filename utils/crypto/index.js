// src/utils/crypto/index.js
// Central Crypto Transaction Parsing Engine.
// Architecture:
// parseTransaction(network, txIdentifier, options)
//        ↓
// network-specific parser (EVM, Litecoin, Bitcoin, Dogecoin, Solana, Tron)
//        ↓
// normalized Transaction object
//        ↓
// validation layer
//        ↓
// price enrichment
//        ↓
// Discord embed formatter

const { createNormalizedTx, validateNormalizedTx } = require('./types');
const {
  normalizeNetworkName,
  detectAddressNetwork,
  detectTxFormat,
  parseTxCommandInput,
  NETWORK_METADATA,
} = require('./networkDetector');
const { EVMTransactionParser, EVM_CHAINS } = require('./parsers/evmParser');
const { LitecoinTransactionParser } = require('./parsers/litecoinParser');
const { BitcoinTransactionParser } = require('./parsers/bitcoinParser');
const { DogecoinTransactionParser } = require('./parsers/dogecoinParser');
const { SolanaTransactionParser } = require('./parsers/solanaParser');
const { TronTransactionParser } = require('./parsers/tronParser');
const { enrichTransactionWithPrices, getUsdPrice } = require('./priceService');
const { buildTransactionEmbed } = require('./embedFormatter');

const evmParsers = new Map();
function getEvmParser(chainKey) {
  if (!evmParsers.has(chainKey)) {
    evmParsers.set(chainKey, new EVMTransactionParser(chainKey));
  }
  return evmParsers.get(chainKey);
}

const ltcParser = new LitecoinTransactionParser();
const btcParser = new BitcoinTransactionParser();
const dogeParser = new DogecoinTransactionParser();
const solParser = new SolanaTransactionParser();
const tronParser = new TronTransactionParser();

/**
 * Parses a transaction on a specific or detected network.
 */
async function parseTransaction(networkKey, txIdentifier, options = {}) {
  const normNet = normalizeNetworkName(networkKey);
  const identifier = String(txIdentifier || '').trim();

  if (!identifier) {
    throw new Error('Transaction identifier is required.');
  }

  let tx = null;

  if (normNet) {
    if (EVM_CHAINS[normNet]) {
      const parser = getEvmParser(normNet);
      tx = await parser.parse(identifier, options);
    } else if (normNet === 'litecoin') {
      tx = await ltcParser.parse(identifier, options);
    } else if (normNet === 'bitcoin') {
      tx = await btcParser.parse(identifier, options);
    } else if (normNet === 'dogecoin') {
      tx = await dogeParser.parse(identifier, options);
    } else if (normNet === 'solana') {
      tx = await solParser.parse(identifier, options);
    } else if (normNet === 'tron') {
      tx = await tronParser.parse(identifier, options);
    } else {
      throw new Error(`Unsupported network: ${networkKey}`);
    }
  } else {
    // No explicit network: detect from format
    const detected = detectTxFormat(identifier);
    if (detected.type === 'solana') {
      tx = await solParser.parse(identifier, options);
    } else if (detected.type === 'hex64') {
      // 64-char hex: Ambiguous across Bitcoin, Litecoin, Dogecoin, Tron
      // Try sequentially with quick fallbacks
      tx = await tronParser.parse(identifier, options).catch(() => null);
      if (!tx) tx = await ltcParser.parse(identifier, options).catch(() => null);
      if (!tx) tx = await btcParser.parse(identifier, options).catch(() => null);
      if (!tx) tx = await dogeParser.parse(identifier, options).catch(() => null);
    } else if (detected.type === 'evm') {
      // Ambiguous EVM: caller should display network selector or specify chain
      return { ambiguous: true, candidates: detected.candidates, hash: identifier };
    } else {
      throw new Error(`Unrecognized transaction hash format: ${identifier}`);
    }
  }

  if (!tx) {
    return null;
  }

  // 1. Validation layer
  validateNormalizedTx(tx);

  // 2. Price enrichment
  await enrichTransactionWithPrices(tx);

  return tx;
}

module.exports = {
  parseTransaction,
  getEvmParser,
  ltcParser,
  btcParser,
  dogeParser,
  solParser,
  tronParser,
  // Sub-modules
  normalizeNetworkName,
  detectAddressNetwork,
  detectTxFormat,
  parseTxCommandInput,
  enrichTransactionWithPrices,
  getUsdPrice,
  buildTransactionEmbed,
  createNormalizedTx,
  EVM_CHAINS,
  NETWORK_METADATA,
};
