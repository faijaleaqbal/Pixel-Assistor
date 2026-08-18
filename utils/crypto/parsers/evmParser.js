// src/utils/crypto/parsers/evmParser.js
// EVM Transaction Parser supporting Polygon, Ethereum, BNB Chain, Arbitrum, Base, and Optimism.
// Correctly reads native transfers AND ERC-20 Transfer event logs with accurate token decimals.

const config = require('../../config');
const { createNormalizedTx } = require('../types');
const { resolveTokenMetadata } = require('../tokenRegistry');

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const EVM_CHAINS = {
  polygon: {
    label: 'Polygon',
    nativeSymbol: 'POL',
    nativeCoinId: 'matic-network',
    explorerHost: 'https://api.polygonscan.com/api',
    explorerUrl: 'https://polygonscan.com',
    apiKey: () => config.polygonscanApiKey,
    rpcEndpoints: [
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
      'https://1rpc.io/matic',
    ],
  },
  ethereum: {
    label: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeCoinId: 'ethereum',
    explorerHost: 'https://api.etherscan.io/api',
    explorerUrl: 'https://etherscan.io',
    apiKey: () => config.etherscanApiKey,
    rpcEndpoints: [
      'https://ethereum-rpc.publicnode.com',
      'https://rpc.ankr.com/eth',
      'https://1rpc.io/eth',
      'https://cloudflare-eth.com',
    ],
  },
  bnb: {
    label: 'BNB Chain',
    nativeSymbol: 'BNB',
    nativeCoinId: 'binancecoin',
    explorerHost: 'https://api.bscscan.com/api',
    explorerUrl: 'https://bscscan.com',
    apiKey: () => config.bscscanApiKey,
    rpcEndpoints: [
      'https://bsc-rpc.publicnode.com',
      'https://bsc-dataseed.binance.org',
      'https://rpc.ankr.com/bsc',
    ],
  },
  arbitrum: {
    label: 'Arbitrum',
    nativeSymbol: 'ETH',
    nativeCoinId: 'ethereum',
    explorerHost: 'https://api.arbiscan.io/api',
    explorerUrl: 'https://arbiscan.io',
    apiKey: () => config.etherscanApiKey || config.polygonscanApiKey,
    rpcEndpoints: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
      'https://1rpc.io/arb',
    ],
  },
  base: {
    label: 'Base',
    nativeSymbol: 'ETH',
    nativeCoinId: 'ethereum',
    explorerHost: 'https://api.basescan.org/api',
    explorerUrl: 'https://basescan.org',
    apiKey: () => config.etherscanApiKey || config.polygonscanApiKey,
    rpcEndpoints: [
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base',
    ],
  },
  optimism: {
    label: 'Optimism',
    nativeSymbol: 'ETH',
    nativeCoinId: 'ethereum',
    explorerHost: 'https://api-optimistic.etherscan.io/api',
    explorerUrl: 'https://optimistic.etherscan.io',
    apiKey: () => config.etherscanApiKey || config.polygonscanApiKey,
    rpcEndpoints: [
      'https://mainnet.optimism.io',
      'https://optimism-rpc.publicnode.com',
      'https://1rpc.io/op',
    ],
  },
};

function getChainRpcList(chainKey) {
  const chain = EVM_CHAINS[chainKey];
  if (!chain) return [];
  const list = [...(chain.rpcEndpoints || [])];
  if (config.alchemyApiKey) {
    if (chainKey === 'ethereum') list.unshift(`https://eth-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`);
    if (chainKey === 'polygon') list.unshift(`https://polygon-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`);
    if (chainKey === 'bnb') list.unshift(`https://bnb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`);
    if (chainKey === 'arbitrum') list.unshift(`https://arb-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`);
    if (chainKey === 'base') list.unshift(`https://base-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`);
    if (chainKey === 'optimism') list.unshift(`https://opt-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`);
  }
  return list;
}

async function callRpc(chainKey, method, params = []) {
  const rpcList = getChainRpcList(chainKey);
  for (const endpoint of rpcList) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      if (json && json.result !== undefined) {
        return json.result;
      }
    } catch {}
  }
  return null;
}

/**
 * Format raw integer token balance by decimals safely into number.
 * Returns null if decimals is unknown/null.
 */
function formatTokenUnits(rawBigInt, decimals) {
  if (decimals === null || decimals === undefined || typeof decimals !== 'number') {
    return null;
  }
  if (rawBigInt === 0n) return 0;
  const dec = Number(decimals);
  if (dec < 0 || dec > 255) return null;

  if (dec === 0) return Number(rawBigInt);

  const factor = 10n ** BigInt(dec);
  const integerPart = rawBigInt / factor;
  const fractionPart = rawBigInt % factor;

  const fractionStr = fractionPart.toString().padStart(dec, '0').replace(/0+$/, '');
  const numStr = fractionStr.length ? `${integerPart.toString()}.${fractionStr}` : integerPart.toString();
  const result = parseFloat(numStr);
  return Number.isFinite(result) ? result : Number(integerPart);
}

/**
 * Extract 20-byte address from 32-byte log topic
 */
function topicToAddress(topic) {
  if (!topic || typeof topic !== 'string') return '';
  const clean = topic.startsWith('0x') ? topic.slice(2) : topic;
  if (clean.length === 64) {
    return '0x' + clean.slice(24);
  }
  return topic;
}

class EVMTransactionParser {
  constructor(chainKey = 'polygon') {
    this.chainKey = String(chainKey || 'polygon').toLowerCase();
    this.chainConfig = EVM_CHAINS[this.chainKey] || EVM_CHAINS.polygon;
  }

  async parse(txHash, options = {}) {
    const hash = String(txHash || '').trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error(`Invalid EVM transaction hash format: ${hash}`);
    }

    const { walletAddress = null } = options;

    // 1. Fetch transaction and receipt in parallel
    const [rawTx, rawReceipt, latestBlockHex] = await Promise.all([
      callRpc(this.chainKey, 'eth_getTransactionByHash', [hash]),
      callRpc(this.chainKey, 'eth_getTransactionReceipt', [hash]),
      callRpc(this.chainKey, 'eth_blockNumber', []),
    ]);

    // Transaction not found on this chain
    if (!rawTx || !rawTx.hash) {
      return null;
    }

    // 2. Fetch block timestamp if blockNumber is present
    let timestamp = null;
    if (rawTx.blockNumber) {
      const block = await callRpc(this.chainKey, 'eth_getBlockByNumber', [rawTx.blockNumber, false]);
      if (block && block.timestamp) {
        const ts = Number(BigInt(block.timestamp)) * 1000;
        // Validate timestamp is sensible (not 0, not in the far future)
        if (ts > 0 && ts <= Date.now() + 5 * 60 * 1000) {
          timestamp = ts;
        }
      }
    }

    // 3. Parse Status & Confirmations (Strictly from receipt status)
    let status = 'pending';
    let confirmations = 0;
    if (rawReceipt) {
      const statusHex = String(rawReceipt.status);
      if (statusHex === '0x1' || statusHex === '1') {
        status = 'confirmed';
      } else if (statusHex === '0x0' || statusHex === '0') {
        status = 'failed';
      } else {
        status = 'unknown';
      }

      if (latestBlockHex && rawTx.blockNumber && status === 'confirmed') {
        const curBlock = BigInt(latestBlockHex);
        const txBlock = BigInt(rawTx.blockNumber);
        if (curBlock >= txBlock) {
          confirmations = Number(curBlock - txBlock + 1n);
        }
      } else if (status === 'confirmed') {
        confirmations = 1;
      }
    }

    // 4. Calculate Fee
    const gasUsed = rawReceipt?.gasUsed ? BigInt(rawReceipt.gasUsed) : (rawTx.gas ? BigInt(rawTx.gas) : 0n);
    const gasPrice = rawReceipt?.effectiveGasPrice ? BigInt(rawReceipt.effectiveGasPrice) : (rawTx.gasPrice ? BigInt(rawTx.gasPrice) : 0n);
    const feeWei = gasUsed * gasPrice;
    const feeAmount = feeWei > 0n ? Number(feeWei) / 1e18 : 0;

    // 5. Parse Native Transfer
    const nativeTransfers = [];
    const rawValue = rawTx.value && rawTx.value !== '0x0' ? BigInt(rawTx.value) : 0n;
    if (rawValue > 0n) {
      const nativeAmount = Number(rawValue) / 1e18;
      nativeTransfers.push({
        from: rawTx.from || '',
        to: rawTx.to || '',
        amount: nativeAmount,
        rawAmount: rawValue.toString(),
        symbol: this.chainConfig.nativeSymbol,
        usdValue: null,
      });
    }

    // 6. Parse ERC-20 Transfer Event Logs
    const tokenTransfers = [];
    const logs = Array.isArray(rawReceipt?.logs) ? rawReceipt.logs : [];

    for (const log of logs) {
      if (
        log.topics &&
        log.topics.length >= 3 &&
        log.topics[0].toLowerCase() === ERC20_TRANSFER_TOPIC
      ) {
        const fromAddr = topicToAddress(log.topics[1]);
        const toAddr = topicToAddress(log.topics[2]);
        const contractAddr = log.address ? log.address.toLowerCase() : '';

        let rawTokenAmount = 0n;
        if (log.data && log.data !== '0x') {
          try {
            rawTokenAmount = BigInt(log.data);
          } catch {}
        } else if (log.topics.length >= 4) {
          // Some non-standard contracts put amount in topic 3
          try {
            rawTokenAmount = BigInt(log.topics[3]);
          } catch {}
        }

        // Resolve token metadata (symbol, decimals)
        const meta = await resolveTokenMetadata(
          this.chainKey,
          contractAddr,
          (m, p) => callRpc(this.chainKey, m, p)
        );

        const tokenAmount = meta.decimals !== null ? formatTokenUnits(rawTokenAmount, meta.decimals) : null;

        tokenTransfers.push({
          contract: contractAddr,
          from: fromAddr,
          to: toAddr,
          amount: tokenAmount,
          rawAmount: rawTokenAmount.toString(),
          symbol: meta.symbol,
          decimals: meta.decimals,
          decimalsUnknown: meta.decimalsUnknown,
          name: meta.name,
          coinId: meta.coinId,
          usdValue: null,
        });
      }
    }

    // 7. Inputs / Outputs representation
    const inputs = [];
    const outputs = [];
    if (rawTx.from) inputs.push({ address: rawTx.from, amount: rawValue > 0n ? Number(rawValue) / 1e18 : 0, symbol: this.chainConfig.nativeSymbol });
    if (rawTx.to) outputs.push({ address: rawTx.to, amount: rawValue > 0n ? Number(rawValue) / 1e18 : 0, symbol: this.chainConfig.nativeSymbol });

    // 8. User Context Direction Detection if walletAddress provided
    let userContext = null;
    if (walletAddress) {
      const normUser = walletAddress.toLowerCase();
      let matchedTransfer = tokenTransfers.find((t) => t.from.toLowerCase() === normUser || t.to.toLowerCase() === normUser);
      if (!matchedTransfer) {
        matchedTransfer = nativeTransfers.find((n) => n.from.toLowerCase() === normUser || n.to.toLowerCase() === normUser);
      }

      if (matchedTransfer) {
        const isSender = matchedTransfer.from.toLowerCase() === normUser;
        const isReceiver = matchedTransfer.to.toLowerCase() === normUser;
        const direction = (isSender && isReceiver) ? 'Self' : (isSender ? 'Sent' : 'Received');

        userContext = {
          address: walletAddress,
          direction,
          amount: matchedTransfer.amount,
          rawAmount: matchedTransfer.rawAmount,
          symbol: matchedTransfer.symbol,
          decimals: matchedTransfer.decimals,
          decimalsUnknown: matchedTransfer.decimalsUnknown,
          usdValue: null,
        };
      }
    }

    return createNormalizedTx({
      network: this.chainConfig.label,
      networkKey: this.chainKey,
      txHash: hash,
      hash,
      status,
      confirmations,
      blockNumber: rawTx.blockNumber ? Number(BigInt(rawTx.blockNumber)) : null,
      timestamp,
      fee: {
        amount: feeAmount,
        symbol: this.chainConfig.nativeSymbol,
      },
      nativeTransfers,
      tokenTransfers,
      inputs,
      outputs,
      userContext,
      explorerTxUrl: `${this.chainConfig.explorerUrl}/tx/${hash}`,
      raw: { tx: rawTx, receipt: rawReceipt },
    });
  }
}

module.exports = {
  EVMTransactionParser,
  EVM_CHAINS,
  callRpc,
  formatTokenUnits,
};
