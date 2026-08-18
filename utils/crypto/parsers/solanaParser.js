// src/utils/crypto/parsers/solanaParser.js
// Solana Transaction Parser supporting native SOL and SPL token transfers.
// Supports Helius enhanced API and standard Solana JSON-RPC getTransaction.

const config = require('../../config');
const { createNormalizedTx } = require('../types');
const { KNOWN_TOKENS } = require('../tokenRegistry');

const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/' + (config.alchemyApiKey || ''),
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
].filter(Boolean);

async function callSolanaRpc(method, params = []) {
  const endpoints = [...SOLANA_RPC_ENDPOINTS];
  if (config.heliusApiKey) {
    endpoints.unshift(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(config.heliusApiKey)}`);
  }

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

class SolanaTransactionParser {
  constructor() {
    this.chainKey = 'solana';
    this.network = 'Solana';
    this.symbol = 'SOL';
  }

  async parse(signature, options = {}) {
    const sig = String(signature || '').trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(sig)) {
      throw new Error(`Invalid Solana transaction signature format: ${sig}`);
    }

    const { walletAddress = null } = options;

    let heliusTx = null;
    let rpcTx = null;

    // 1. Try Helius Enhanced API if key available
    if (config.heliusApiKey) {
      try {
        const url = `https://api.helius.xyz/v0/transactions/?api-key=${encodeURIComponent(config.heliusApiKey)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: [sig] }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (res.ok) {
          const arr = await res.json().catch(() => null);
          if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
            heliusTx = arr[0];
          }
        }
      } catch {}
    }

    // 2. Try Solana JSON-RPC (jsonParsed)
    if (!heliusTx) {
      try {
        rpcTx = await callSolanaRpc('getTransaction', [
          sig,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]);
      } catch {}
    }

    if (!heliusTx && !rpcTx) {
      return null;
    }

    let timestamp = null;
    let status = 'confirmed';
    let confirmations = 1;
    let slot = null;
    let fee = 0;
    const nativeTransfers = [];
    const tokenTransfers = [];
    const inputs = [];
    const outputs = [];

    if (heliusTx) {
      if (heliusTx.timestamp) {
        const ts = heliusTx.timestamp * 1000;
        if (ts > 0 && ts <= Date.now() + 5 * 60 * 1000) timestamp = ts;
      } else if (heliusTx.blockTime) {
        const ts = heliusTx.blockTime * 1000;
        if (ts > 0 && ts <= Date.now() + 5 * 60 * 1000) timestamp = ts;
      }

      status = (heliusTx.meta?.err || heliusTx.transactionError) ? 'failed' : 'confirmed';
      slot = heliusTx.slot || null;
      confirmations = status === 'confirmed' ? 1 : 0;
      fee = heliusTx.fee ? heliusTx.fee / 1e9 : (heliusTx.meta?.fee ? heliusTx.meta.fee / 1e9 : 0);

      // Account keys
      const rawKeys = heliusTx.transaction?.message?.accountKeys || heliusTx.accounts || [];
      const accountKeys = rawKeys.map((k) => (typeof k === 'string' ? k : (k.pubkey || k.account || String(k))));

      // 1) Parse Helius tokenTransfers
      if (Array.isArray(heliusTx.tokenTransfers) && heliusTx.tokenTransfers.length > 0) {
        for (const t of heliusTx.tokenTransfers) {
          const mint = t.mint || '';
          const known = KNOWN_TOKENS.solana[mint];
          const decimals = t.decimals ?? (known?.decimals || 6);
          const rawAmt = t.amount != null ? Number(t.amount) : (t.tokenAmount != null ? Number(t.tokenAmount) : 0);
          const amount = t.decimals ? rawAmt / Math.pow(10, decimals) : rawAmt;
          const symbol = known?.symbol || (mint ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : 'SPL Token');

          const from = t.fromUserAccount || t.source || '';
          const to = t.toUserAccount || t.destination || '';

          tokenTransfers.push({
            contract: mint,
            mint,
            from,
            to,
            amount,
            rawAmount: rawAmt.toString(),
            symbol,
            decimals,
            decimalsUnknown: false,
            usdValue: null,
          });

          if (from) inputs.push({ address: from, amount, symbol });
          if (to) outputs.push({ address: to, amount, symbol });
        }
      }

      // 2) Parse native transfers
      if (Array.isArray(heliusTx.nativeTransfers) && heliusTx.nativeTransfers.length > 0) {
        for (const n of heliusTx.nativeTransfers) {
          const amt = n.amount ? n.amount / 1e9 : 0;
          if (amt > 0) {
            nativeTransfers.push({
              from: n.fromUserAccount || '',
              to: n.toUserAccount || '',
              amount: amt,
              rawAmount: n.amount?.toString() || '0',
              symbol: 'SOL',
              usdValue: null,
            });
            if (n.fromUserAccount) inputs.push({ address: n.fromUserAccount, amount: amt, symbol: 'SOL' });
            if (n.toUserAccount) outputs.push({ address: n.toUserAccount, amount: amt, symbol: 'SOL' });
          }
        }
      }

      // 3) Parse parsed instructions for system transfers if nativeTransfers was empty
      if (!nativeTransfers.length && !tokenTransfers.length) {
        const instructions = heliusTx.instructions || heliusTx.transaction?.message?.instructions || [];
        for (const ix of instructions) {
          if (ix.parsed?.type === 'transfer' && ix.parsed?.info) {
            const info = ix.parsed.info;
            if (info.lamports) {
              const amt = Number(info.lamports) / 1e9;
              nativeTransfers.push({
                from: info.source || accountKeys[0] || '',
                to: info.destination || '',
                amount: amt,
                rawAmount: info.lamports.toString(),
                symbol: 'SOL',
                usdValue: null,
              });
              if (info.source) inputs.push({ address: info.source, amount: amt, symbol: 'SOL' });
              if (info.destination) outputs.push({ address: info.destination, amount: amt, symbol: 'SOL' });
            }
          }
        }
      }
    } else if (rpcTx) {
      if (rpcTx.blockTime) {
        const ts = rpcTx.blockTime * 1000;
        if (ts > 0 && ts <= Date.now() + 5 * 60 * 1000) timestamp = ts;
      }

      status = rpcTx.meta?.err ? 'failed' : 'confirmed';
      slot = rpcTx.slot || null;
      confirmations = status === 'confirmed' ? 1 : 0;
      fee = rpcTx.meta?.fee ? rpcTx.meta.fee / 1e9 : 0;

      const message = rpcTx.transaction?.message || {};
      const instructions = message.instructions || [];

      // 1) Parse instructions
      for (const ix of instructions) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
          const info = ix.parsed.info || {};
          const amt = info.lamports ? Number(info.lamports) / 1e9 : 0;
          if (amt > 0) {
            nativeTransfers.push({
              from: info.source || '',
              to: info.destination || '',
              amount: amt,
              rawAmount: info.lamports?.toString() || '0',
              symbol: 'SOL',
              usdValue: null,
            });
            if (info.source) inputs.push({ address: info.source, amount: amt, symbol: 'SOL' });
            if (info.destination) outputs.push({ address: info.destination, amount: amt, symbol: 'SOL' });
          }
        } else if (ix.program === 'spl-token' && (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked')) {
          const info = ix.parsed.info || {};
          let amt = 0;
          let decimals = 6;
          let rawAmountStr = '0';
          if (info.tokenAmount) {
            amt = Number(info.tokenAmount.uiAmount || 0);
            decimals = info.tokenAmount.decimals || 6;
            rawAmountStr = info.tokenAmount.amount || '0';
          } else if (info.amount) {
            amt = Number(info.amount) / 1e6;
            rawAmountStr = info.amount.toString();
          }
          const mint = info.mint || '';
          const known = KNOWN_TOKENS.solana[mint];
          const symbol = known?.symbol || (mint ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : 'SPL Token');

          tokenTransfers.push({
            contract: mint,
            mint,
            from: info.source || info.authority || '',
            to: info.destination || '',
            amount: amt,
            rawAmount: rawAmountStr,
            symbol,
            decimals,
            decimalsUnknown: false,
            usdValue: null,
          });
          if (info.source) inputs.push({ address: info.source, amount: amt, symbol });
          if (info.destination) outputs.push({ address: info.destination, amount: amt, symbol });
        }
      }

      // 2) Parse token balance differences if no token transfers found yet
      if (!tokenTransfers.length && rpcTx.meta?.preTokenBalances && rpcTx.meta?.postTokenBalances) {
        const preMap = new Map();
        for (const pb of rpcTx.meta.preTokenBalances) {
          preMap.set(`${pb.accountIndex}:${pb.mint}`, Number(pb.uiTokenAmount?.uiAmount || 0));
        }
        for (const pb of rpcTx.meta.postTokenBalances) {
          const key = `${pb.accountIndex}:${pb.mint}`;
          const preAmt = preMap.get(key) || 0;
          const postAmt = Number(pb.uiTokenAmount?.uiAmount || 0);
          const diff = postAmt - preAmt;
          if (diff > 0) {
            const known = KNOWN_TOKENS.solana[pb.mint];
            const symbol = known?.symbol || `${pb.mint.slice(0, 4)}…${pb.mint.slice(-4)}`;
            tokenTransfers.push({
              contract: pb.mint,
              mint: pb.mint,
              from: '',
              to: pb.owner || '',
              amount: diff,
              rawAmount: pb.uiTokenAmount?.amount || '0',
              symbol,
              decimals: pb.uiTokenAmount?.decimals || 6,
              decimalsUnknown: false,
              usdValue: null,
            });
          }
        }
      }
    }

    // Direction detection for walletAddress
    let userContext = null;
    if (walletAddress) {
      const normAddr = walletAddress.trim();
      const matchedToken = tokenTransfers.find((t) => t.from === normAddr || t.to === normAddr);
      const matchedNative = nativeTransfers.find((n) => n.from === normAddr || n.to === normAddr);
      const target = matchedToken || matchedNative;

      if (target) {
        const isSender = target.from === normAddr;
        const isReceiver = target.to === normAddr;
        const direction = (isSender && isReceiver) ? 'Self' : (isSender ? 'Sent' : 'Received');
        userContext = {
          address: walletAddress,
          direction,
          amount: target.amount,
          rawAmount: target.rawAmount,
          symbol: target.symbol,
          decimals: target.decimals,
          decimalsUnknown: target.decimalsUnknown,
          usdValue: null,
        };
      }
    }

    return createNormalizedTx({
      network: this.network,
      networkKey: this.chainKey,
      txHash: sig,
      hash: sig,
      status,
      confirmations,
      blockNumber: slot,
      timestamp,
      fee: {
        amount: fee,
        symbol: this.symbol,
      },
      nativeTransfers,
      tokenTransfers,
      inputs,
      outputs,
      userContext,
      explorerTxUrl: `https://solscan.io/tx/${sig}`,
      raw: heliusTx || rpcTx,
    });
  }
}

module.exports = {
  SolanaTransactionParser,
  callSolanaRpc,
};
