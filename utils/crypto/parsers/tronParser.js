// src/utils/crypto/parsers/tronParser.js
// Tron Transaction Parser supporting native TRX and TRC-20 token transfers.

const config = require('../../config');
const { createNormalizedTx } = require('../types');
const { KNOWN_TOKENS } = require('../tokenRegistry');

const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

class TronTransactionParser {
  constructor() {
    this.chainKey = 'tron';
    this.network = 'Tron';
    this.symbol = 'TRX';
  }

  async parse(txHash, options = {}) {
    const hash = String(txHash || '').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error(`Invalid Tron transaction hash format: ${hash}`);
    }

    if (!config.trongridApiKey) {
      return null;
    }

    const { walletAddress = null } = options;
    const url = `https://api.trongrid.io/v1/transactions/${encodeURIComponent(hash)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: { 'TRON-PRO-API-KEY': config.trongridApiKey },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      if (!j || !Array.isArray(j.data) || !j.data.length) return null;

      const d = j.data[0];
      const ret = d.ret?.[0]?.contractRet || 'unknown';
      const status = ret === 'SUCCESS' ? 'confirmed' : 'failed';
      const contractData = d.raw_data?.contract?.[0] || d.data?.[0] || {};
      const ct = contractData.type || contractData.contract?.type || '';
      const paramVal = contractData.parameter?.value || contractData.contract?.parameter?.value || {};

      const nativeTransfers = [];
      const tokenTransfers = [];
      const inputs = [];
      const outputs = [];

      let fee = d.fee ? Number(d.fee) / 1e6 : 0;
      let timestamp = null;
      const rawTs = d.block_timestamp || d.raw_data?.timestamp;
      if (rawTs) {
        const ts = Number(rawTs);
        if (ts > 0 && ts <= Date.now() + 5 * 60 * 1000) {
          timestamp = ts;
        }
      }

      if (ct === 'TransferContract') {
        const from = paramVal.owner_address || '';
        const to = paramVal.to_address || '';
        const amt = paramVal.amount ? Number(paramVal.amount) / 1e6 : 0;

        nativeTransfers.push({
          from,
          to,
          amount: amt,
          rawAmount: paramVal.amount?.toString() || '0',
          symbol: 'TRX',
          usdValue: null,
        });
        if (from) inputs.push({ address: from, amount: amt, symbol: 'TRX' });
        if (to) outputs.push({ address: to, amount: amt, symbol: 'TRX' });
      } else if (ct === 'TriggerSmartContract') {
        const from = paramVal.owner_address || '';
        const contractAddr = paramVal.contract_address || '';
        const dataHex = String(paramVal.data || '');

        let to = paramVal.to_address || '';
        let amount = 0;
        let rawAmountStr = '0';
        let symbol = 'USDT';
        let decimals = 6;

        // ERC20/TRC20 transfer selector: a9059cbb
        if (dataHex.startsWith('a9059cbb') && dataHex.length >= 72) {
          const toHex = dataHex.slice(8, 72);
          const amtHex = dataHex.slice(72, 136);
          if (toHex.length >= 40) {
            to = '41' + toHex.slice(-40);
          }
          if (amtHex.length) {
            try {
              const rawBig = BigInt('0x' + amtHex);
              rawAmountStr = rawBig.toString();
              amount = Number(rawBig) / 1e6;
            } catch {}
          }
        }

        const known = KNOWN_TOKENS.tron[contractAddr] || KNOWN_TOKENS.tron[TRON_USDT_CONTRACT];
        if (known) {
          symbol = known.symbol;
          decimals = known.decimals;
        }

        tokenTransfers.push({
          contract: contractAddr || TRON_USDT_CONTRACT,
          from,
          to,
          amount,
          rawAmount: rawAmountStr,
          symbol,
          decimals,
          decimalsUnknown: false,
          usdValue: null,
        });

        if (from) inputs.push({ address: from, amount, symbol });
        if (to) outputs.push({ address: to, amount, symbol });
      }

      // Direction detection
      let userContext = null;
      if (walletAddress) {
        const normAddr = walletAddress.trim();
        const matched = tokenTransfers[0] || nativeTransfers[0];
        if (matched) {
          const isSender = matched.from === normAddr;
          const isReceiver = matched.to === normAddr;
          const direction = (isSender && isReceiver) ? 'Self' : (isSender ? 'Sent' : 'Received');
          userContext = {
            address: walletAddress,
            direction,
            amount: matched.amount,
            rawAmount: matched.rawAmount,
            symbol: matched.symbol,
            decimals: matched.decimals,
            decimalsUnknown: matched.decimalsUnknown,
            usdValue: null,
          };
        }
      }

      return createNormalizedTx({
        network: this.network,
        networkKey: this.chainKey,
        txHash: hash,
        hash,
        status,
        confirmations: status === 'confirmed' ? 1 : 0,
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
        explorerTxUrl: `https://tronscan.org/#/transaction/${hash}`,
        raw: d,
      });
    } catch {
      return null;
    }
  }
}

module.exports = {
  TronTransactionParser,
};
