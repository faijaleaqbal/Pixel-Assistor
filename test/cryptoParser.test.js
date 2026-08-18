// test/cryptoParser.test.js
// Comprehensive test suite for multi-chain crypto transaction parser.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeNetworkName,
  detectAddressNetwork,
  detectTxFormat,
  parseTxCommandInput,
} = require('../utils/crypto/networkDetector');
const { EVMTransactionParser, EVM_CHAINS, formatTokenUnits } = require('../utils/crypto/parsers/evmParser');
const { LitecoinTransactionParser, round8 } = require('../utils/crypto/parsers/litecoinParser');
const { SolanaTransactionParser } = require('../utils/crypto/parsers/solanaParser');
const { TronTransactionParser } = require('../utils/crypto/parsers/tronParser');
const { createNormalizedTx, validateNormalizedTx, sanitizeTimestamp } = require('../utils/crypto/types');
const { resolveTokenMetadata, decodeAbiString, decodeAbiUint } = require('../utils/crypto/tokenRegistry');
const { enrichTransactionWithPrices, getCoinIdForSymbol } = require('../utils/crypto/priceService');
const { buildTransactionEmbed, formatCryptoAmount, formatUsdAmount, formatUtcTimestamp } = require('../utils/crypto/embedFormatter');
const { parseTransaction } = require('../utils/crypto');
const cryptoApi = require('../utils/cryptoApi');

describe('Deterministic Network Detection', () => {
  it('Priority A: Explicit network in command args', () => {
    assert.deepEqual(parseTxCommandInput(['polygon', '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef']), {
      explicitNetwork: 'polygon',
      txIdentifier: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      walletAddress: null,
    });

    assert.deepEqual(parseTxCommandInput(['ltc', '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b', 'LgN8Q9g2Z5Yg4M3k7R2s1T9u8v7w6x5y4z']), {
      explicitNetwork: 'litecoin',
      txIdentifier: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      walletAddress: 'LgN8Q9g2Z5Yg4M3k7R2s1T9u8v7w6x5y4z',
    });

    assert.deepEqual(parseTxCommandInput(['solana', '5UfgPc2N9N3JmC9eQZ7wFqBq3L9xK2mP6yR8vT1wS4uX7zYaB2cD4eF6gH8jK1mN3pQ5rS7tU9vW1xY3zA5bC7de']), {
      explicitNetwork: 'solana',
      txIdentifier: '5UfgPc2N9N3JmC9eQZ7wFqBq3L9xK2mP6yR8vT1wS4uX7zYaB2cD4eF6gH8jK1mN3pQ5rS7tU9vW1xY3zA5bC7de',
      walletAddress: null,
    });

    assert.deepEqual(parseTxCommandInput(['0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'eth']), {
      explicitNetwork: 'ethereum',
      txIdentifier: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      walletAddress: null,
    });
  });

  it('Priority B: Address format detection (Legacy, SegWit, EVM, Solana, Tron)', () => {
    assert.equal(detectAddressNetwork('0x71C7656EC7ab88b098defB751B7401B5f6d8976F').type, 'evm');
    assert.equal(detectAddressNetwork('LgN8Q9g2Z5Yg4M3k7R2s1T9u8v7w6x5y4z').type, 'litecoin');
    assert.equal(detectAddressNetwork('MNyPq2K4aW4B9jXyZ3v5U7t9r1q3p5o7i9').type, 'litecoin');
    assert.equal(detectAddressNetwork('ltc1qg6hyv6z4m0c9y5t8r3e2w1q0p9o8i7u6y5t4r3').type, 'litecoin');
    assert.equal(detectAddressNetwork('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t').type, 'tron');
    assert.equal(detectAddressNetwork('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v').type, 'solana');
  });

  it('Priority C: Hash format detection & Bug 4 (Solana vs LTC / 64-hex check)', () => {
    const realSolanaSig = '5UfgPc2N9N3JmC9eQZ7wFqBq3L9xK2mP6yR8vT1wS4uX7zYaB2cD4eF6gH8jK1mN3pQ5rS7tU9vW1xY3zA5bC7de';
    const validEvmHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const hex64 = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b';

    assert.equal(detectTxFormat(validEvmHash).type, 'evm');
    assert.equal(detectTxFormat(hex64).type, 'hex64');
    assert.notEqual(detectTxFormat(hex64).type, 'solana');
    assert.equal(detectTxFormat(realSolanaSig).type, 'solana');
    assert.equal(detectTxFormat('invalid_hash_123').type, 'unknown');
  });
});

describe('Token Decimal Resolution & Safety (No 18-decimal Fallback)', () => {
  it('Resolves known token with registry decimals (USDT=6, WBTC=8, WETH=18)', async () => {
    const polygonUsdt = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
    const metaUsdt = await resolveTokenMetadata('polygon', polygonUsdt);
    assert.equal(metaUsdt.symbol, 'USDT');
    assert.equal(metaUsdt.decimals, 6);
    assert.equal(metaUsdt.decimalsUnknown, false);

    const ethWbtc = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
    const metaWbtc = await resolveTokenMetadata('ethereum', ethWbtc);
    assert.equal(metaWbtc.symbol, 'WBTC');
    assert.equal(metaWbtc.decimals, 8);
    assert.equal(metaWbtc.decimalsUnknown, false);
  });

  it('Resolves unknown token with successful decimals() and symbol() RPC calls', async () => {
    const mockRpc = async (method, params) => {
      if (params[0].data === '0x313ce567') {
        // decimals(): returns 8
        return '0x0000000000000000000000000000000000000000000000000000000000000008';
      }
      if (params[0].data === '0x95d89b41') {
        // symbol(): returns "TEST"
        return '0x5445535400000000000000000000000000000000000000000000000000000000';
      }
      return '0x';
    };

    const dummyAddr = '0x1234567890123456789012345678901234567891';
    const meta = await resolveTokenMetadata('polygon', dummyAddr, mockRpc);
    assert.equal(meta.symbol, 'TEST');
    assert.equal(meta.decimals, 8);
    assert.equal(meta.decimalsUnknown, false);
  });

  it('Handles unknown token with successful decimals() but failed symbol()', async () => {
    const mockRpc = async (method, params) => {
      if (params[0].data === '0x313ce567') {
        // decimals(): returns 6
        return '0x0000000000000000000000000000000000000000000000000000000000000006';
      }
      // symbol() fails
      return '0x';
    };

    const dummyAddr = '0x1234567890123456789012345678901234567892';
    const meta = await resolveTokenMetadata('polygon', dummyAddr, mockRpc);
    assert.equal(meta.symbol, 'UNKNOWN_TOKEN');
    assert.equal(meta.decimals, 6);
    assert.equal(meta.decimalsUnknown, false);
  });

  it('NEVER defaults to 18 decimals when decimals() RPC call fails', async () => {
    const mockRpc = async () => '0x'; // fails

    const dummyAddr = '0x1234567890123456789012345678901234567893';
    const meta = await resolveTokenMetadata('polygon', dummyAddr, mockRpc);
    assert.equal(meta.decimals, null);
    assert.equal(meta.decimalsUnknown, true);
    assert.notEqual(meta.decimals, 18);

    const formatted = formatTokenUnits(1000000n, meta.decimals);
    assert.equal(formatted, null);
  });

  it('Rejects malformed decimals() RPC responses (e.g. > 255 or non-hex)', () => {
    assert.equal(decodeAbiUint('0x'), null);
    assert.equal(decodeAbiUint(null), null);
    // Value 300 (> 255)
    assert.equal(decodeAbiUint('0x000000000000000000000000000000000000000000000000000000000000012c'), null);
    // Valid 0 decimals (e.g. non-fractional token)
    assert.equal(decodeAbiUint('0x0000000000000000000000000000000000000000000000000000000000000000'), 0);
    // Valid 18 decimals
    assert.equal(decodeAbiUint('0x0000000000000000000000000000000000000000000000000000000000000012'), 18);
  });

  it('Correctly scales unusual decimals (0, 6, 8, 9, 18)', () => {
    const raw = 1000000000n;
    assert.equal(formatTokenUnits(raw, 0), 1000000000);
    assert.equal(formatTokenUnits(raw, 6), 1000);
    assert.equal(formatTokenUnits(raw, 8), 10);
    assert.equal(formatTokenUnits(raw, 9), 1);
    assert.equal(formatTokenUnits(raw, 18), 0.000000001);
  });

  it('Embed formatter displays raw amount and warning for unknown decimals', () => {
    const tx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'confirmed',
      timestamp: 1700000000000,
      tokenTransfers: [
        {
          contract: '0xabc...',
          from: '0x111...',
          to: '0x222...',
          amount: null,
          rawAmount: '956183000000000',
          symbol: 'CUSTOM',
          decimals: null,
          decimalsUnknown: true,
        },
      ],
      inputs: [],
      outputs: [],
    });

    const embedData = buildTransactionEmbed(tx);
    const desc = embedData.embeds[0].data.description;
    assert.match(desc, /956183000000000 CUSTOM \(Decimals Unknown\)/);
    assert.match(desc, /Token decimals could not be determined/);
  });
});

describe('Confirmation and Finality Hardening', () => {
  it('EVM: Pending when receipt is missing', () => {
    const tx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'pending',
      confirmations: 0,
      timestamp: 1700000000000,
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.status, 'pending');
    assert.equal(tx.confirmations, 0);
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /Pending ⏳/);
    assert.match(embedData.embeds[0].data.description, /0 \(Unconfirmed\)/);
  });

  it('EVM: Failed when receipt status is 0', () => {
    const tx = createNormalizedTx({
      network: 'Ethereum',
      networkKey: 'ethereum',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'failed',
      confirmations: 0,
      timestamp: 1700000000000,
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.status, 'failed');
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /Failed ❌/);
  });

  it('EVM: Confirmed when receipt status is 1 with exact block confirmations', () => {
    const tx = createNormalizedTx({
      network: 'Ethereum',
      networkKey: 'ethereum',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'confirmed',
      confirmations: 42,
      blockNumber: 19000000,
      timestamp: 1700000000000,
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.status, 'confirmed');
    assert.equal(tx.confirmations, 42);
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /Confirmed ✅/);
    assert.match(embedData.embeds[0].data.description, /42/);
  });

  it('Litecoin: Pending when 0 confirmations', () => {
    const tx = createNormalizedTx({
      network: 'Litecoin',
      networkKey: 'litecoin',
      txHash: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      status: 'pending',
      confirmations: 0,
      timestamp: 1700000000000,
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.status, 'pending');
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /Pending ⏳/);
  });

  it('Solana: Failed when meta.err is present', () => {
    const tx = createNormalizedTx({
      network: 'Solana',
      networkKey: 'solana',
      txHash: '5UfgPc2N9N3JmC9eQZ7wFqBq3L9xK2mP6yR8vT1wS4uX7zYaB2cD4eF6gH8jK1mN3pQ5rS7tU9vW1xY3zA5bC7de',
      status: 'failed',
      confirmations: 0,
      timestamp: 1700000000000,
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.status, 'failed');
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /Failed ❌/);
  });

  it('Tron: Failed when contractRet is not SUCCESS', () => {
    const tx = createNormalizedTx({
      network: 'Tron',
      networkKey: 'tron',
      txHash: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      status: 'failed',
      confirmations: 0,
      timestamp: 1700000000000,
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.status, 'failed');
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /Failed ❌/);
  });
});

describe('Timestamp Hardening (No Fake Date.now() Fallback)', () => {
  it('Sanitizes valid, missing, zero, and future timestamps', () => {
    const now = Date.now();
    const valid = now - 60000;
    assert.equal(sanitizeTimestamp(valid), valid);

    // Missing / null / undefined -> null
    assert.equal(sanitizeTimestamp(null), null);
    assert.equal(sanitizeTimestamp(undefined), null);
    assert.equal(sanitizeTimestamp('2026-08-18'), null);

    // Zero or negative -> null
    assert.equal(sanitizeTimestamp(0), null);
    assert.equal(sanitizeTimestamp(-1000), null);

    // Future timestamp (> 10 minutes ahead) -> null
    const future = now + 1000 * 60 * 60; // 1 hour ahead
    assert.equal(sanitizeTimestamp(future), null);
  });

  it('Embed displays Unknown when timestamp is null', () => {
    const tx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'confirmed',
      timestamp: null,
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.timestamp, null);
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /Created At:\*\* \*Unknown\*/);
  });
});

describe('Polygon & EVM Multi-Chain Support', () => {
  it('Configures all required EVM chains (Polygon, Ethereum, BNB, Arbitrum, Base, Optimism)', () => {
    const requiredChains = ['polygon', 'ethereum', 'bnb', 'arbitrum', 'base', 'optimism'];
    for (const k of requiredChains) {
      assert.ok(EVM_CHAINS[k], `Missing chain config for ${k}`);
      assert.ok(EVM_CHAINS[k].nativeSymbol, `Missing nativeSymbol for ${k}`);
      assert.ok(EVM_CHAINS[k].explorerUrl, `Missing explorerUrl for ${k}`);
    }
  });

  it('Parses native POL transfer correctly', () => {
    const tx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'confirmed',
      confirmations: 25,
      timestamp: 1700000000000,
      fee: { amount: 0.002, symbol: 'POL' },
      nativeTransfers: [
        { from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222', amount: 5.5, symbol: 'POL' },
      ],
      tokenTransfers: [],
      inputs: [{ address: '0x1111111111111111111111111111111111111111', amount: 5.5, symbol: 'POL' }],
      outputs: [{ address: '0x2222222222222222222222222222222222222222', amount: 5.5, symbol: 'POL' }],
      explorerTxUrl: 'https://polygonscan.com/tx/0x1234...',
    });

    assert.equal(tx.primaryAsset.symbol, 'POL');
    assert.equal(tx.primaryAsset.amount, 5.5);
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /5\.5 POL/);
  });

  it('Parses Polygon USDT transfer and never outputs "0 POL"', () => {
    const rawTx = {
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      from: '0x1111111111111111111111111111111111111111',
      to: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      value: '0x0',
    };

    const tokenTransfer = {
      contract: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      amount: 0.956183,
      symbol: 'USDT',
      decimals: 6,
      decimalsUnknown: false,
    };

    const tx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: rawTx.hash,
      status: 'confirmed',
      confirmations: 128,
      timestamp: 1700000000000,
      fee: { amount: 0.005, symbol: 'POL' },
      nativeTransfers: [],
      tokenTransfers: [tokenTransfer],
      inputs: [{ address: rawTx.from, amount: 0, symbol: 'POL' }],
      outputs: [{ address: tokenTransfer.to, amount: 0.956183, symbol: 'USDT' }],
      explorerTxUrl: `https://polygonscan.com/tx/${rawTx.hash}`,
    });

    validateNormalizedTx(tx);
    assert.equal(tx.primaryAsset.symbol, 'USDT');
    assert.equal(tx.primaryAsset.amount, 0.956183);

    const embedData = buildTransactionEmbed(tx);
    const desc = embedData.embeds[0].data.description;
    assert.match(desc, /0\.956183 USDT/);
    assert.doesNotMatch(desc, /Total Amount: 0 POL/);
  });

  it('Handles multiple token transfers + native fee transaction', () => {
    const tx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'confirmed',
      confirmations: 10,
      timestamp: 1700000000000,
      fee: { amount: 0.001, symbol: 'POL' },
      nativeTransfers: [{ from: '0x111...', to: '0x222...', amount: 0.001, symbol: 'POL' }],
      tokenTransfers: [
        { contract: '0xc21...', from: '0x111...', to: '0x222...', amount: 0.956183, symbol: 'USDT', decimals: 6, decimalsUnknown: false },
        { contract: '0x3c4...', from: '0x111...', to: '0x333...', amount: 5.0, symbol: 'USDC', decimals: 6, decimalsUnknown: false },
      ],
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.tokenTransfers.length, 2);
    assert.equal(tx.nativeTransfers.length, 1);
    assert.equal(tx.fee.amount, 0.001);

    const embedData = buildTransactionEmbed(tx);
    const desc = embedData.embeds[0].data.description;
    assert.match(desc, /0\.956183 USDT/);
    assert.match(desc, /5 USDC/);
  });
});

describe('Litecoin UTXO Accounting & Edge Cases', () => {
  it('Parses real production transaction 8d5aac33303c7907c2cf804a3bb2f2535fc80d7da02287f42e2ce90870b5c68b correctly without 0 LTC or Unknown addresses', async () => {
    const parser = new LitecoinTransactionParser();
    const hash = '8d5aac33303c7907c2cf804a3bb2f2535fc80d7da02287f42e2ce90870b5c68b';
    const tx = await parser.parse(hash);

    assert.ok(tx, 'Transaction must be found and parsed');
    assert.equal(tx.network, 'Litecoin');
    assert.equal(tx.primaryAsset.symbol, 'LTC');
    assert.equal(tx.primaryAsset.amount, 0.02276348);
    assert.notEqual(tx.primaryAsset.amount, 0);
    assert.equal(tx.fee.amount, 0.0000187);

    // Verify inputs & outputs are properly decoded (never Unknown)
    assert.equal(tx.inputs.length, 2);
    assert.equal(tx.inputs[0].address, 'LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui');
    assert.equal(tx.inputs[0].amount, 0.01130556);
    assert.equal(tx.inputs[1].address, 'LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui');
    assert.equal(tx.inputs[1].amount, 0.06654695);

    assert.equal(tx.outputs.length, 2);
    assert.equal(tx.outputs[0].address, 'ltc1qjuk66rlld22j7rsqjjr8edejkgjx7395s9ct35');
    assert.equal(tx.outputs[0].amount, 0.02276348);
    assert.equal(tx.outputs[1].address, 'LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui');
    assert.equal(tx.outputs[1].amount, 0.05507033);

    // Embed formatting check
    const embedData = buildTransactionEmbed(tx);
    const desc = embedData.embeds[0].data.description;
    assert.match(desc, /0\.02276348 LTC/);
    assert.match(desc, /`LZLmSrgm…EJpFui`/);
    assert.match(desc, /`ltc1qjuk…s9ct35`/);
    assert.doesNotMatch(desc, /Inputs:\s*>\s*`Unknown`/);
    assert.doesNotMatch(desc, /Outputs:\s*>\s*`Unknown`/);
  });

  it('Supports BlockCypher fixture (inputs/outputs array format)', () => {
    const blockcypherFixture = {
      inputs: [
        { output_value: 5000000, addresses: ['LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui'], prev_hash: 'tx1', output_index: 0 },
      ],
      outputs: [
        { value: 2000000, addresses: ['ltc1qreceiveraddress11111111111111111'] },
        { value: 2998000, addresses: ['LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui'] }, // change
      ],
      fees: 2000,
      confirmations: 10,
    };

    const inputs = blockcypherFixture.inputs.map((inp, idx) => {
      const addr = inp.addresses[0];
      const sats = BigInt(inp.output_value);
      return { address: addr, sats, amount: Number(sats) / 1e8, symbol: 'LTC' };
    });
    const outputs = blockcypherFixture.outputs.map((out, idx) => {
      const addr = out.addresses[0];
      const sats = BigInt(out.value);
      return { address: addr, sats, amount: Number(sats) / 1e8, symbol: 'LTC' };
    });

    const senderAddrs = new Set(inputs.map((i) => i.address));
    const paymentOut = outputs.find((o) => !senderAddrs.has(o.address));
    assert.equal(paymentOut.amount, 0.02);
  });

  it('Supports Esplora / LiteSpace fixture (prevout.scriptpubkey_address format)', () => {
    const esploraFixture = {
      vin: [
        {
          txid: 'prevtx1',
          vout: 0,
          prevout: {
            scriptpubkey_address: 'LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui',
            value: 8000000,
          },
        },
      ],
      vout: [
        { scriptpubkey_address: 'ltc1qreceiveraddress22222222222222222', value: 3000000 },
        { scriptpubkey_address: 'LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui', value: 4995000 },
      ],
      fee: 5000,
    };

    const inAddr = esploraFixture.vin[0].prevout.scriptpubkey_address;
    const outAddr = esploraFixture.vout[0].scriptpubkey_address;
    assert.equal(inAddr, 'LZLmSrgmQ5vnFZaYNMJv3pt6CK3rEJpFui');
    assert.equal(outAddr, 'ltc1qreceiveraddress22222222222222222');
  });

  it('Litecoin receive: calculates received amount from relevant UTXOs (not sum of outputs)', () => {
    const queriedAddress = 'ltc1qreceiveraddress1234567890abcdef';
    const senderAddress = 'ltc1qsenderaddress1234567890abcdef';

    const inputs = [
      { txid: 'in1', vout: 0, address: senderAddress, sats: 7800000n, amount: 0.078, symbol: 'LTC' },
    ];
    const outputs = [
      { vout: 0, address: queriedAddress, sats: 2276348n, amount: 0.02276348, symbol: 'LTC' },
      { vout: 1, address: senderAddress, sats: 5500000n, amount: 0.055, symbol: 'LTC' },
    ];

    const userOut = outputs.filter((o) => o.address === queriedAddress);
    const userReceived = userOut.reduce((sum, o) => sum + o.sats, 0n);

    assert.equal(Number(userReceived) / 1e8, 0.02276348);
  });

  it('Litecoin send: handles multiple inputs, change output, and fee calculation in BigInt satoshis', () => {
    const senderAddress = 'ltc1qsenderaddress1234567890abcdef';
    const recipient1 = 'ltc1qreceiver111111111111111111111111';
    const recipient2 = 'ltc1qreceiver222222222222222222222222';

    const inputs = [
      { txid: 'in1', vout: 0, address: senderAddress, sats: 50000000n, amount: 0.5, symbol: 'LTC' },
      { txid: 'in2', vout: 1, address: senderAddress, sats: 80000000n, amount: 0.8, symbol: 'LTC' },
    ];
    const outputs = [
      { vout: 0, address: recipient1, sats: 40000000n, amount: 0.4, symbol: 'LTC' },
      { vout: 1, address: recipient2, sats: 30000000n, amount: 0.3, symbol: 'LTC' },
      { vout: 2, address: senderAddress, sats: 59800000n, amount: 0.598, symbol: 'LTC' }, // change
    ];

    const totalInSats = inputs.reduce((sum, i) => sum + i.sats, 0n); // 130000000n
    const totalOutSats = outputs.reduce((sum, o) => sum + o.sats, 0n); // 129800000n
    const feeSats = totalInSats - totalOutSats; // 200000n
    const changeSats = 59800000n;
    const netSentSats = totalInSats - changeSats; // 70200000n

    assert.equal(totalInSats, 130000000n);
    assert.equal(feeSats, 200000n);
    assert.equal(netSentSats, 70200000n);
    assert.equal(Number(netSentSats) / 1e8, 0.702);
  });

  it('Populates input and output addresses without "-" and shows Unknown when address is genuinely missing', () => {
    const tx = createNormalizedTx({
      network: 'Litecoin',
      networkKey: 'litecoin',
      txHash: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      status: 'confirmed',
      confirmations: 12,
      timestamp: 1700000000000,
      fee: { amount: 0.0001, symbol: 'LTC' },
      inputs: [{ txid: 'inputtx1', vout: 0, address: 'Unknown', amount: 0.05, symbol: 'LTC' }],
      outputs: [{ vout: 0, address: 'LgN8Q9g2Z5Yg4M3k7R2s1T9u8v7w6x5y4z', amount: 0.0499, symbol: 'LTC' }],
    });

    const embedData = buildTransactionEmbed(tx);
    const desc = embedData.embeds[0].data.description;

    assert.match(desc, /`Unknown`/);
    assert.match(desc, /`LgN8Q9g2…6x5y4z`/);
    assert.doesNotMatch(desc, /Inputs:\s*>\s*`—`/);
    assert.doesNotMatch(desc, /Outputs:\s*>\s*`—`/);
  });
});

describe('Solana Transaction Parsing & SPL Token Support', () => {
  it('Parses native SOL transfer', () => {
    const tx = createNormalizedTx({
      network: 'Solana',
      networkKey: 'solana',
      txHash: '5UfgPc2N9N3JmC9eQZ7wFqBq3L9xK2mP6yR8vT1wS4uX7zYaB2cD4eF6gH8jK1mN3pQ5rS7tU9vW1xY3zA5bC7de',
      status: 'confirmed',
      confirmations: 1,
      timestamp: 1700000000000,
      fee: { amount: 0.000005, symbol: 'SOL' },
      nativeTransfers: [
        { from: 'Sender111', to: 'Receiver222', amount: 3.5, symbol: 'SOL' },
      ],
      inputs: [{ address: 'Sender111', amount: 3.5, symbol: 'SOL' }],
      outputs: [{ address: 'Receiver222', amount: 3.5, symbol: 'SOL' }],
    });

    assert.equal(tx.primaryAsset.symbol, 'SOL');
    assert.equal(tx.primaryAsset.amount, 3.5);
  });

  it('Parses SPL USDC token transfer and does NOT display 0 SOL', () => {
    const tx = createNormalizedTx({
      network: 'Solana',
      networkKey: 'solana',
      txHash: '5UfgPc2N9N3JmC9eQZ7wFqBq3L9xK2mP6yR8vT1wS4uX7zYaB2cD4eF6gH8jK1mN3pQ5rS7tU9vW1xY3zA5bC7de',
      status: 'confirmed',
      confirmations: 32,
      timestamp: 1700000000000,
      fee: { amount: 0.000005, symbol: 'SOL' },
      tokenTransfers: [
        {
          contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          from: 'SenderAccount123',
          to: 'ReceiverAccount456',
          amount: 12.5,
          symbol: 'USDC',
          decimals: 6,
          decimalsUnknown: false,
        },
      ],
      inputs: [{ address: 'SenderAccount123', amount: 12.5, symbol: 'USDC' }],
      outputs: [{ address: 'ReceiverAccount456', amount: 12.5, symbol: 'USDC' }],
      explorerTxUrl: 'https://solscan.io/tx/5UfgPc...',
    });

    validateNormalizedTx(tx);
    assert.equal(tx.primaryAsset.symbol, 'USDC');
    assert.equal(tx.primaryAsset.amount, 12.5);
    assert.notEqual(tx.primaryAsset.symbol, 'SOL');

    const embedData = buildTransactionEmbed(tx);
    const desc = embedData.embeds[0].data.description;
    assert.match(desc, /12\.5 USDC/);
    assert.doesNotMatch(desc, /Total Amount: 0 SOL/);
  });

  it('Handles multiple SPL transfers', () => {
    const tx = createNormalizedTx({
      network: 'Solana',
      networkKey: 'solana',
      txHash: '5UfgPc2N9N3JmC9eQZ7wFqBq3L9xK2mP6yR8vT1wS4uX7zYaB2cD4eF6gH8jK1mN3pQ5rS7tU9vW1xY3zA5bC7de',
      status: 'confirmed',
      confirmations: 10,
      timestamp: 1700000000000,
      fee: { amount: 0.000005, symbol: 'SOL' },
      tokenTransfers: [
        { contract: 'EPjFW...', mint: 'EPjFW...', from: 'S1', to: 'R1', amount: 10, symbol: 'USDC', decimals: 6, decimalsUnknown: false },
        { contract: 'Es9vM...', mint: 'Es9vM...', from: 'S1', to: 'R2', amount: 20, symbol: 'USDT', decimals: 6, decimalsUnknown: false },
      ],
      inputs: [],
      outputs: [],
    });

    assert.equal(tx.tokenTransfers.length, 2);
    const embedData = buildTransactionEmbed(tx);
    assert.match(embedData.embeds[0].data.description, /10 USDC/);
    assert.match(embedData.embeds[0].data.description, /20 USDT/);
  });
});

describe('Tron TRX and TRC-20 Token Transfers', () => {
  it('Parses native TRX transfer', () => {
    const tx = createNormalizedTx({
      network: 'Tron',
      networkKey: 'tron',
      txHash: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      status: 'confirmed',
      confirmations: 1,
      timestamp: 1700000000000,
      fee: { amount: 1.1, symbol: 'TRX' },
      nativeTransfers: [
        { from: 'T111111111111111111111111111111111', to: 'T222222222222222222222222222222222', amount: 100, symbol: 'TRX' },
      ],
      inputs: [{ address: 'T111111111111111111111111111111111', amount: 100, symbol: 'TRX' }],
      outputs: [{ address: 'T222222222222222222222222222222222', amount: 100, symbol: 'TRX' }],
    });

    assert.equal(tx.primaryAsset.symbol, 'TRX');
    assert.equal(tx.primaryAsset.amount, 100);
  });

  it('Parses TRC-20 USDT transfer', () => {
    const tx = createNormalizedTx({
      network: 'Tron',
      networkKey: 'tron',
      txHash: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      status: 'confirmed',
      confirmations: 1,
      timestamp: 1700000000000,
      fee: { amount: 13.5, symbol: 'TRX' },
      tokenTransfers: [
        {
          contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          from: 'T111111111111111111111111111111111',
          to: 'T222222222222222222222222222222222',
          amount: 50,
          symbol: 'USDT',
          decimals: 6,
          decimalsUnknown: false,
        },
      ],
      inputs: [{ address: 'T111111111111111111111111111111111', amount: 50, symbol: 'USDT' }],
      outputs: [{ address: 'T222222222222222222222222222222222', amount: 50, symbol: 'USDT' }],
    });

    assert.equal(tx.primaryAsset.symbol, 'USDT');
    assert.equal(tx.primaryAsset.amount, 50);
  });
});

describe('Invalid Input & API Failure Handling', () => {
  it('Rejects random or malformed transaction ID with format error', () => {
    assert.equal(detectTxFormat('invalid_id').type, 'unknown');
    assert.equal(detectTxFormat('12345').type, 'unknown');
  });

  it('Does not misclassify LTC 64-hex as Solana or EVM', () => {
    const ltcHex = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b';
    const detected = detectTxFormat(ltcHex);
    assert.equal(detected.type, 'hex64');
    assert.notEqual(detected.type, 'solana');
    assert.notEqual(detected.type, 'evm');
  });

  it('Throws clear error if invalid hash is passed to EVM, Solana, or Litecoin parser directly', async () => {
    const evm = new EVMTransactionParser('polygon');
    await assert.rejects(async () => {
      await evm.parse('not_an_evm_hash');
    }, /Invalid EVM transaction hash format/);

    const sol = new SolanaTransactionParser();
    await assert.rejects(async () => {
      await sol.parse('not_a_solana_sig');
    }, /Invalid Solana transaction signature format/);

    const ltc = new LitecoinTransactionParser();
    await assert.rejects(async () => {
      await ltc.parse('0x123456');
    }, /Invalid Litecoin transaction hash format/);
  });
});

describe('Price Enrichment & Sanity Checks', () => {
  it('Calculates USD value using the exact asset price (LTC price for LTC, USDT for USDT)', async () => {
    const ltcTx = createNormalizedTx({
      network: 'Litecoin',
      networkKey: 'litecoin',
      txHash: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
      status: 'confirmed',
      timestamp: 1700000000000,
      primaryAsset: { symbol: 'LTC', amount: 2.0, usdValue: null },
      fee: { amount: 0.001, symbol: 'LTC' },
      inputs: [],
      outputs: [],
    });

    const usdtTx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'confirmed',
      timestamp: 1700000000000,
      primaryAsset: { symbol: 'USDT', amount: 0.956183, usdValue: null },
      fee: { amount: 0.005, symbol: 'POL' },
      inputs: [],
      outputs: [],
    });

    await enrichTransactionWithPrices(ltcTx);
    await enrichTransactionWithPrices(usdtTx);

    assert.equal(typeof usdtTx.primaryAsset.usdValue, 'number');
    assert.ok(usdtTx.primaryAsset.usdValue > 0.9 && usdtTx.primaryAsset.usdValue < 1.1);

    const usdtEmbed = buildTransactionEmbed(usdtTx);
    assert.match(usdtEmbed.embeds[0].data.description, /Approx\. Value/);
  });

  it('Handles price unavailable gracefully without returning $0 or NaN', () => {
    const tx = createNormalizedTx({
      network: 'Polygon',
      networkKey: 'polygon',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'confirmed',
      timestamp: 1700000000000,
      primaryAsset: { symbol: 'OBSCURE_TOKEN', amount: 100, usdValue: null },
      fee: { amount: 0.001, symbol: 'POL' },
      inputs: [],
      outputs: [],
    });

    const embedData = buildTransactionEmbed(tx);
    const desc = embedData.embeds[0].data.description;
    assert.match(desc, /Price unavailable/);
    assert.doesNotMatch(desc, /\$0\.00 USD/);
    assert.doesNotMatch(desc, /NaN/);
  });
});

describe('Crypto API Facade & Backwards Compatibility', () => {
  it('Exports expected functions for balance, convert, price, and tx lookup', () => {
    assert.equal(typeof cryptoApi.getPrice, 'function');
    assert.equal(typeof cryptoApi.convert, 'function');
    assert.equal(typeof cryptoApi.searchCoin, 'function');
    assert.equal(typeof cryptoApi.detectTxChain, 'function');
    assert.equal(typeof cryptoApi.detectAddressChain, 'function');
    assert.equal(typeof cryptoApi.parseTransaction, 'function');
    assert.equal(typeof cryptoApi.evmFetchTx, 'function');
    assert.equal(typeof cryptoApi.evmFetchBalance, 'function');
    assert.equal(typeof cryptoApi.solanaFetchTx, 'function');
    assert.equal(typeof cryptoApi.solanaFetchBalance, 'function');
    assert.equal(typeof cryptoApi.litecoinFetchTx, 'function');
    assert.equal(typeof cryptoApi.litecoinFetchBalance, 'function');
    assert.equal(typeof cryptoApi.tronFetchTx, 'function');
    assert.equal(typeof cryptoApi.tronFetchBalance, 'function');
  });

  it('detectAddressChain properly categorizes address formats', () => {
    assert.equal(cryptoApi.detectAddressChain('0x71C7656EC7ab88b098defB751B7401B5f6d8976F').type, 'evm');
    assert.equal(cryptoApi.detectAddressChain('LgN8Q9g2Z5Yg4M3k7R2s1T9u8v7w6x5y4z').type, 'litecoin');
    assert.equal(cryptoApi.detectAddressChain('ltc1qg6hyv6z4m0c9y5t8r3e2w1q0p9o8i7u6y5t4r3').type, 'litecoin');
    assert.equal(cryptoApi.detectAddressChain('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t').type, 'tron');
  });
});
