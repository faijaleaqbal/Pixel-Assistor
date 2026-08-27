// src/utils/crypto/parsers/dogecoinParser.js
// Production-grade UTXO-based Dogecoin Transaction Parser.
// Accurately extracts inputs, outputs, satoshis (koinu), fees, confirmations,
// and resolves wallet/transaction level amounts with integer BigInt precision.

const config = require('../../config');
const { createNormalizedTx } = require('../types');

/**
 * Converts BigInt koinu (1 DOGE = 10^8 koinu) to human-readable DOGE float.
 */
function koinuToDoge(sats) {
  if (typeof sats !== 'bigint') sats = BigInt(sats || 0);
  const isNegative = sats < 0n;
  const absSats = isNegative ? -sats : sats;
  const integerPart = absSats / 100000000n;
  const fractionPart = absSats % 100000000n;
  const fractionStr = fractionPart.toString().padStart(8, '0').replace(/0+$/, '');
  const numStr = fractionStr.length ? `${integerPart.toString()}.${fractionStr}` : integerPart.toString();
  const num = parseFloat(numStr);
  return isNegative ? -num : num;
}

function normalizeToKoinu(val) {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return BigInt(val);
    return BigInt(Math.round(val * 1e8));
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
    const parsed = parseFloat(trimmed);
    if (Number.isFinite(parsed)) return BigInt(Math.round(parsed * 1e8));
  }
  return 0n;
}

function extractDogeKoinu(item) {
  if (!item || typeof item !== 'object') {
    if (typeof item === 'number' || typeof item === 'string' || typeof item === 'bigint') {
      return normalizeToKoinu(item);
    }
    return 0n;
  }

  if (item.output_value != null) return normalizeToKoinu(item.output_value);
  if (item.value != null) return normalizeToKoinu(item.value);
  if (item.value_sat != null) return normalizeToKoinu(item.value_sat);
  if (item.satoshis != null) return normalizeToKoinu(item.satoshis);

  if (item.prevout) {
    if (item.prevout.value != null) return normalizeToKoinu(item.prevout.value);
    if (item.prevout.value_sat != null) return normalizeToKoinu(item.prevout.value_sat);
  }

  return 0n;
}

function extractDogeAddress(item) {
  if (!item) return 'Unknown';
  if (typeof item === 'string') return item.trim() || 'Unknown';

  if (typeof item.address === 'string' && item.address.trim()) {
    return item.address.trim();
  }

  if (Array.isArray(item.addresses) && item.addresses.length > 0 && typeof item.addresses[0] === 'string') {
    const a = item.addresses[0].trim();
    if (a) return a;
  }

  if (typeof item.recipient === 'string' && item.recipient.trim()) {
    return item.recipient.trim();
  }

  if (typeof item.scriptpubkey_address === 'string' && item.scriptpubkey_address.trim()) {
    return item.scriptpubkey_address.trim();
  }

  if (Array.isArray(item.scriptpubkey_addresses) && item.scriptpubkey_addresses.length > 0 && typeof item.scriptpubkey_addresses[0] === 'string') {
    const a = item.scriptpubkey_addresses[0].trim();
    if (a) return a;
  }

  if (item.prevout && typeof item.prevout === 'object') {
    const prevAddr = extractDogeAddress(item.prevout);
    if (prevAddr && prevAddr !== 'Unknown') return prevAddr;
  }

  if (item.scriptPubKey && typeof item.scriptPubKey === 'object') {
    if (typeof item.scriptPubKey.address === 'string' && item.scriptPubKey.address.trim()) {
      return item.scriptPubKey.address.trim();
    }
    if (Array.isArray(item.scriptPubKey.addresses) && item.scriptPubKey.addresses.length > 0) {
      const a = String(item.scriptPubKey.addresses[0]).trim();
      if (a) return a;
    }
  }

  return 'Unknown';
}

class DogecoinTransactionParser {
  constructor() {
    this.chainKey = 'dogecoin';
    this.network = 'Dogecoin';
    this.symbol = 'DOGE';
    this.coinId = 'dogecoin';
  }

  async parse(txHash, options = {}) {
    const hash = String(txHash || '').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error(`Invalid Dogecoin transaction hash format: ${hash}`);
    }

    const { walletAddress = null } = options;

    let rawData = null;
    let provider = null;

    // 1. Try Blockchair API
    try {
      const url = `https://api.blockchair.com/dogecoin/dashboards/transaction/${encodeURIComponent(hash)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && json.data && json.data[hash]) {
          rawData = json.data[hash];
          provider = 'blockchair';
        }
      }
    } catch {}

    // 2. Try BlockCypher
    if (!rawData) {
      try {
        const tokenParam = config.blockcypherToken ? `?token=${encodeURIComponent(config.blockcypherToken)}` : '';
        const url = `https://api.blockcypher.com/v1/doge/main/txs/${encodeURIComponent(hash)}${tokenParam}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json && json.hash && !json.error) {
            rawData = json;
            provider = 'blockcypher';
          }
        }
      } catch {}
    }

    // 3. Try SoChain API
    if (!rawData) {
      try {
        const url = `https://sochain.com/api/v2/tx/DOGE/${encodeURIComponent(hash)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json && json.status === 'success' && json.data) {
            rawData = json.data;
            provider = 'sochain';
          }
        }
      } catch {}
    }

    if (!rawData) {
      return null;
    }

    const rawInputsList = rawData.inputs || rawData.vin || [];
    const rawOutputsList = rawData.outputs || rawData.vout || [];

    const inputs = rawInputsList.map((inp, idx) => {
      const addr = extractDogeAddress(inp);
      const sats = extractDogeKoinu(inp);
      return {
        txid: inp.transaction_hash || inp.prev_hash || inp.txid || inp.received_from?.txid || '',
        vout: inp.index ?? inp.output_index ?? inp.vout ?? inp.output_no ?? idx,
        address: addr,
        sats,
        amount: koinuToDoge(sats),
        symbol: 'DOGE',
      };
    });

    const outputs = rawOutputsList.map((out, idx) => {
      const addr = extractDogeAddress(out);
      const sats = extractDogeKoinu(out);
      return {
        vout: out.index ?? out.output_index ?? out.vout ?? out.output_no ?? idx,
        address: addr,
        sats,
        amount: koinuToDoge(sats),
        symbol: 'DOGE',
      };
    });

    let rawFeeSats = 0n;
    let confirmations = 0;
    let blockNumber = null;
    let timestamp = null;

    if (provider === 'blockchair') {
      const txObj = rawData.transaction || {};
      rawFeeSats = BigInt(txObj.fee || 0);
      blockNumber = txObj.block_id ?? null;
      confirmations = blockNumber ? 1 : 0;
      if (txObj.time) {
        const parsed = Date.parse(txObj.time);
        if (!Number.isNaN(parsed) && parsed > 0 && parsed <= Date.now() + 5 * 60 * 1000) {
          timestamp = parsed;
        }
      }
    } else if (provider === 'blockcypher') {
      rawFeeSats = BigInt(rawData.fees || 0);
      confirmations = typeof rawData.confirmations === 'number' ? Math.max(0, rawData.confirmations) : 0;
      blockNumber = rawData.block_height ?? null;
      if (rawData.received) {
        const parsed = Date.parse(rawData.received);
        if (!Number.isNaN(parsed) && parsed > 0 && parsed <= Date.now() + 5 * 60 * 1000) {
          timestamp = parsed;
        }
      } else if (rawData.time && rawData.time > 0) {
        const parsed = rawData.time * 1000;
        if (parsed <= Date.now() + 5 * 60 * 1000) timestamp = parsed;
      }
    } else if (provider === 'sochain') {
      rawFeeSats = normalizeToKoinu(rawData.fee || 0);
      confirmations = typeof rawData.confirmations === 'number' ? Math.max(0, rawData.confirmations) : 0;
      blockNumber = rawData.block_no ?? null;
      if (rawData.time && rawData.time > 0) {
        const parsed = rawData.time * 1000;
        if (parsed <= Date.now() + 5 * 60 * 1000) timestamp = parsed;
      }
    }

    const totalInputSats = inputs.reduce((sum, i) => sum + i.sats, 0n);
    const totalOutputSats = outputs.reduce((sum, o) => sum + o.sats, 0n);

    let feeSats = rawFeeSats;
    if (feeSats <= 0n && totalInputSats > totalOutputSats) {
      feeSats = totalInputSats - totalOutputSats;
    }
    const feeDoge = koinuToDoge(feeSats);

    let userContext = null;
    let primaryAmountSats = totalOutputSats;
    let txType = 'Transfer';

    if (walletAddress) {
      const normAddr = walletAddress.trim().toLowerCase();

      const userIn = inputs.filter((i) => i.address && i.address.toLowerCase() === normAddr);
      const userOut = outputs.filter((o) => o.address && o.address.toLowerCase() === normAddr);

      const totalUserInSats = userIn.reduce((sum, i) => sum + i.sats, 0n);
      const totalUserOutSats = userOut.reduce((sum, o) => sum + o.sats, 0n);

      const isSender = totalUserInSats > 0n;
      const isReceiver = totalUserOutSats > 0n;

      if (isSender && isReceiver) {
        if (totalUserInSats >= totalUserOutSats) {
          const netSentSats = totalUserInSats - totalUserOutSats;
          primaryAmountSats = netSentSats > 0n ? netSentSats : totalUserInSats;
          txType = 'Sent';
        } else {
          const netReceivedSats = totalUserOutSats - totalUserInSats;
          primaryAmountSats = netReceivedSats;
          txType = 'Received';
        }
      } else if (isReceiver) {
        primaryAmountSats = totalUserOutSats;
        txType = 'Received';
      } else if (isSender) {
        primaryAmountSats = totalUserInSats;
        txType = 'Sent';
      }

      userContext = {
        address: walletAddress,
        direction: txType,
        amount: koinuToDoge(primaryAmountSats),
        rawAmount: primaryAmountSats.toString(),
        symbol: this.symbol,
        usdValue: null,
      };
    } else {
      const inputAddresses = new Set(
        inputs.map((i) => i.address.toLowerCase()).filter((a) => a !== 'unknown')
      );

      if (outputs.length === 1) {
        primaryAmountSats = outputs[0].sats;
      } else if (outputs.length > 1 && inputAddresses.size > 0) {
        const paymentOutputs = outputs.filter((o) => !inputAddresses.has(o.address.toLowerCase()));
        if (paymentOutputs.length > 0) {
          primaryAmountSats = paymentOutputs.reduce((sum, o) => sum + o.sats, 0n);
        } else {
          primaryAmountSats = totalOutputSats;
        }
      } else if (outputs.length > 0) {
        primaryAmountSats = outputs[0].sats;
      }
    }

    const primaryAmountDoge = koinuToDoge(primaryAmountSats);
    const totalOutputDoge = koinuToDoge(totalOutputSats);
    const status = confirmations > 0 ? 'confirmed' : 'pending';

    return createNormalizedTx({
      network: this.network,
      networkKey: this.chainKey,
      txHash: hash,
      hash,
      status,
      confirmations,
      blockNumber,
      timestamp,
      fee: {
        amount: feeDoge,
        rawAmount: feeSats.toString(),
        symbol: this.symbol,
      },
      nativeTransfers: [
        {
          from: inputs[0]?.address || 'Unknown',
          to: outputs[0]?.address || 'Unknown',
          amount: primaryAmountDoge,
          rawAmount: primaryAmountSats.toString(),
          symbol: this.symbol,
          usdValue: null,
        },
      ],
      tokenTransfers: [],
      inputs,
      outputs,
      userContext,
      primaryAsset: {
        symbol: this.symbol,
        coinId: this.coinId,
        amount: primaryAmountDoge,
        rawAmount: primaryAmountSats.toString(),
        totalOutput: totalOutputDoge,
        type: txType,
        decimals: 8,
        decimalsUnknown: false,
        usdValue: null,
      },
      explorerTxUrl: `https://blockchair.com/dogecoin/transaction/${hash}`,
      raw: rawData,
    });
  }
}

module.exports = {
  DogecoinTransactionParser,
  extractDogeAddress,
  extractDogeKoinu,
  koinuToDoge,
};
