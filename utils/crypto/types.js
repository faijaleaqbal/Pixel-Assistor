// src/utils/crypto/types.js
// Standardized Transaction model, helper types, and validation logic.

/**
 * Validates and normalizes UTC epoch timestamp (ms).
 * Returns null if missing, zero, negative, or in the future.
 */
function sanitizeTimestamp(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
    return null;
  }
  // If timestamp is more than 10 minutes into the future, treat as invalid
  if (ts > Date.now() + 10 * 60 * 1000) {
    return null;
  }
  return Math.floor(ts);
}

/**
 * Creates a normalized transaction object.
 */
function createNormalizedTx(data = {}) {
  const txHash = String(data.txHash || data.hash || '').trim();
  const tx = {
    network: data.network || 'Unknown',
    networkKey: data.networkKey || 'unknown',
    txHash,
    hash: txHash,
    status: data.status || 'unknown', // 'confirmed' | 'failed' | 'pending' | 'unknown'
    confirmations: typeof data.confirmations === 'number' ? Math.max(0, data.confirmations) : 0,
    blockNumber: data.blockNumber ?? null,
    timestamp: sanitizeTimestamp(data.timestamp),
    fee: {
      amount: typeof data.fee?.amount === 'number' && Number.isFinite(data.fee.amount) ? data.fee.amount : 0,
      symbol: data.fee?.symbol || 'COIN',
      usdValue: typeof data.fee?.usdValue === 'number' && Number.isFinite(data.fee.usdValue) ? data.fee.usdValue : null,
    },
    nativeTransfers: Array.isArray(data.nativeTransfers) ? data.nativeTransfers : [],
    tokenTransfers: Array.isArray(data.tokenTransfers) ? data.tokenTransfers : [],
    inputs: Array.isArray(data.inputs) ? data.inputs : [],
    outputs: Array.isArray(data.outputs) ? data.outputs : [],
    addresses: Array.isArray(data.addresses) ? data.addresses : [],
    userContext: data.userContext || null,
    primaryAsset: data.primaryAsset || null,
    explorerTxUrl: data.explorerTxUrl || '',
    raw: data.raw || null,
  };

  // Derive addresses list if empty
  if (!tx.addresses.length) {
    const addrSet = new Set();
    for (const inp of tx.inputs) if (inp.address && inp.address !== 'Unknown') addrSet.add(inp.address.toLowerCase());
    for (const out of tx.outputs) if (out.address && out.address !== 'Unknown') addrSet.add(out.address.toLowerCase());
    for (const n of tx.nativeTransfers) {
      if (n.from) addrSet.add(n.from.toLowerCase());
      if (n.to) addrSet.add(n.to.toLowerCase());
    }
    for (const t of tx.tokenTransfers) {
      if (t.from) addrSet.add(t.from.toLowerCase());
      if (t.to) addrSet.add(t.to.toLowerCase());
    }
    tx.addresses = Array.from(addrSet);
  }

  // Deduce primary asset if not set
  if (!tx.primaryAsset) {
    tx.primaryAsset = determinePrimaryAsset(tx);
  }

  return tx;
}

/**
 * Determines primary asset and display amount from transfers and UTXO data.
 */
function determinePrimaryAsset(tx) {
  // If user context exists, prioritize user context
  if (tx.userContext && (tx.userContext.amount > 0 || tx.userContext.rawAmount)) {
    return {
      symbol: tx.userContext.symbol,
      amount: tx.userContext.amount,
      rawAmount: tx.userContext.rawAmount || null,
      decimals: tx.userContext.decimals ?? null,
      decimalsUnknown: !!tx.userContext.decimalsUnknown,
      usdValue: tx.userContext.usdValue ?? null,
      type: tx.userContext.direction || 'Transfer',
    };
  }

  // Token transfer takes precedence over 0 native transfer
  if (tx.tokenTransfers.length > 0) {
    const mainToken = tx.tokenTransfers[0];
    return {
      symbol: mainToken.symbol,
      amount: mainToken.amount,
      rawAmount: mainToken.rawAmount || null,
      decimals: mainToken.decimals ?? null,
      decimalsUnknown: !!mainToken.decimalsUnknown,
      usdValue: mainToken.usdValue ?? null,
      type: 'Transfer',
    };
  }

  // Native transfer
  if (tx.nativeTransfers.length > 0 && tx.nativeTransfers[0].amount > 0) {
    const mainNative = tx.nativeTransfers[0];
    const nativeDecimals = tx.networkKey === 'solana' ? 9 : (tx.networkKey === 'tron' ? 6 : 18);
    return {
      symbol: mainNative.symbol,
      amount: mainNative.amount,
      rawAmount: mainNative.rawAmount || null,
      decimals: nativeDecimals,
      decimalsUnknown: false,
      usdValue: mainNative.usdValue ?? null,
      type: 'Transfer',
    };
  }

  // UTXO outputs (e.g. Litecoin / Bitcoin)
  if (tx.outputs.length > 0) {
    const totalOut = tx.outputs.reduce((acc, o) => acc + (o.amount || 0), 0);
    const mainOut = tx.outputs.length === 1 ? tx.outputs[0] : (tx.outputs.find((o) => o.amount > 0) || tx.outputs[0]);
    return {
      symbol: mainOut.symbol || (tx.networkKey === 'litecoin' ? 'LTC' : 'BTC'),
      amount: tx.outputs.length === 1 ? mainOut.amount : totalOut,
      totalOutput: totalOut,
      decimals: 8,
      decimalsUnknown: false,
      usdValue: null,
      type: 'Transfer',
    };
  }

  if (tx.nativeTransfers.length > 0) {
    const mainNative = tx.nativeTransfers[0];
    const nativeDecimals = tx.networkKey === 'solana' ? 9 : (tx.networkKey === 'tron' ? 6 : 18);
    return {
      symbol: mainNative.symbol,
      amount: mainNative.amount,
      decimals: nativeDecimals,
      decimalsUnknown: false,
      usdValue: mainNative.usdValue ?? null,
      type: 'Transfer',
    };
  }

  return {
    symbol: tx.fee.symbol || 'COIN',
    amount: 0,
    decimalsUnknown: false,
    usdValue: null,
    type: 'Contract Interaction',
  };
}

/**
 * Validate normalized transaction structure.
 */
function validateNormalizedTx(tx) {
  if (!tx || typeof tx !== 'object') {
    throw new Error('Invalid transaction object.');
  }
  if (!tx.txHash) {
    throw new Error('Transaction is missing a transaction hash/signature.');
  }
  if (!tx.network || tx.network === 'Unknown') {
    throw new Error('Transaction network could not be resolved.');
  }
  return true;
}

module.exports = {
  createNormalizedTx,
  determinePrimaryAsset,
  validateNormalizedTx,
  sanitizeTimestamp,
};
