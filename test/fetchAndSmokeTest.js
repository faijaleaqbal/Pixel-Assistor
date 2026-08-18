// test/fetchAndSmokeTest.js
// Fetches real recent transactions from mainnets and runs them through our parsers.

const { parseTransaction } = require('../utils/crypto');
const { EVMTransactionParser, callRpc } = require('../utils/crypto/parsers/evmParser');
const { LitecoinTransactionParser } = require('../utils/crypto/parsers/litecoinParser');
const { SolanaTransactionParser, callSolanaRpc } = require('../utils/crypto/parsers/solanaParser');
const { buildTransactionEmbed } = require('../utils/crypto/embedFormatter');

async function testPolygonLive() {
  console.log('--- Testing Polygon Live ---');
  try {
    const latestBlockHex = await callRpc('polygon', 'eth_blockNumber', []);
    if (!latestBlockHex) {
      console.log('Polygon RPC: Could not retrieve latest block');
      return null;
    }
    const blockNum = Number(BigInt(latestBlockHex)) - 20; // 20 blocks ago for finality
    const block = await callRpc('polygon', 'eth_getBlockByNumber', ['0x' + blockNum.toString(16), true]);
    if (!block || !block.transactions || !block.transactions.length) {
      console.log('Polygon RPC: No transactions found in block');
      return null;
    }

    // Find a transaction in this block
    const tx = block.transactions[0];
    const txHash = typeof tx === 'string' ? tx : tx.hash;
    console.log(`Testing Polygon Tx: ${txHash}`);
    const parsed = await parseTransaction('polygon', txHash);
    if (parsed) {
      console.log(`✔ Polygon Parsed: Status=${parsed.status}, Asset=${parsed.primaryAsset.symbol}, Amount=${parsed.primaryAsset.amount}, Confirmations=${parsed.confirmations}, Fee=${parsed.fee.amount} ${parsed.fee.symbol}`);
      return parsed;
    }
  } catch (err) {
    console.error('Polygon Error:', err.message);
  }
  return null;
}

async function testEthereumLive() {
  console.log('--- Testing Ethereum Live ---');
  try {
    const latestBlockHex = await callRpc('ethereum', 'eth_blockNumber', []);
    if (!latestBlockHex) {
      console.log('Ethereum RPC: Could not retrieve latest block');
      return null;
    }
    const blockNum = Number(BigInt(latestBlockHex)) - 10;
    const block = await callRpc('ethereum', 'eth_getBlockByNumber', ['0x' + blockNum.toString(16), true]);
    if (!block || !block.transactions || !block.transactions.length) {
      console.log('Ethereum RPC: No transactions found in block');
      return null;
    }

    const tx = block.transactions[0];
    const txHash = typeof tx === 'string' ? tx : tx.hash;
    console.log(`Testing Ethereum Tx: ${txHash}`);
    const parsed = await parseTransaction('ethereum', txHash);
    if (parsed) {
      console.log(`✔ Ethereum Parsed: Status=${parsed.status}, Asset=${parsed.primaryAsset.symbol}, Amount=${parsed.primaryAsset.amount}, Confirmations=${parsed.confirmations}, Fee=${parsed.fee.amount} ${parsed.fee.symbol}`);
      return parsed;
    }
  } catch (err) {
    console.error('Ethereum Error:', err.message);
  }
  return null;
}

async function testBaseLive() {
  console.log('--- Testing Base Live ---');
  try {
    const latestBlockHex = await callRpc('base', 'eth_blockNumber', []);
    if (!latestBlockHex) return null;
    const blockNum = Number(BigInt(latestBlockHex)) - 20;
    const block = await callRpc('base', 'eth_getBlockByNumber', ['0x' + blockNum.toString(16), true]);
    if (!block || !block.transactions || !block.transactions.length) return null;

    const tx = block.transactions[0];
    const txHash = typeof tx === 'string' ? tx : tx.hash;
    console.log(`Testing Base Tx: ${txHash}`);
    const parsed = await parseTransaction('base', txHash);
    if (parsed) {
      console.log(`✔ Base Parsed: Status=${parsed.status}, Asset=${parsed.primaryAsset.symbol}, Amount=${parsed.primaryAsset.amount}, Confirmations=${parsed.confirmations}`);
      return parsed;
    }
  } catch (err) {
    console.error('Base Error:', err.message);
  }
  return null;
}

async function testLitecoinLive() {
  console.log('--- Testing Litecoin Live ---');
  try {
    // Query a well-known recent Litecoin transaction from blockchair
    const res = await fetch('https://api.blockchair.com/litecoin/transactions?limit=1');
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.data && json.data.length) {
        const txHash = json.data[0].hash;
        console.log(`Testing Litecoin Tx: ${txHash}`);
        const parsed = await parseTransaction('litecoin', txHash);
        if (parsed) {
          console.log(`✔ Litecoin Parsed: Status=${parsed.status}, Amount=${parsed.primaryAsset.amount} LTC, Confirmations=${parsed.confirmations}, Inputs=${parsed.inputs.length}, Outputs=${parsed.outputs.length}`);
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Litecoin Error:', err.message);
  }
  return null;
}

async function testSolanaLive() {
  console.log('--- Testing Solana Live ---');
  try {
    // Get recent slot and block
    const slot = await callSolanaRpc('getSlot', []);
    if (slot) {
      const block = await callSolanaRpc('getBlock', [slot - 50, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, transactionDetails: 'signatures' }]);
      if (block && block.signatures && block.signatures.length) {
        const sig = block.signatures[0];
        console.log(`Testing Solana Tx: ${sig}`);
        const parsed = await parseTransaction('solana', sig);
        if (parsed) {
          console.log(`✔ Solana Parsed: Status=${parsed.status}, Asset=${parsed.primaryAsset.symbol}, Amount=${parsed.primaryAsset.amount}`);
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Solana Error:', err.message);
  }
  return null;
}

async function run() {
  console.log('=== RUNNING DYNAMIC LIVE BLOCKCHAIN VERIFICATION ===\n');
  const p = await testPolygonLive();
  const e = await testEthereumLive();
  const b = await testBaseLive();
  const l = await testLitecoinLive();
  const s = await testSolanaLive();

  console.log('\n=== LIVE TEST SUMMARY ===');
  console.log('Polygon Live:', p ? 'PASSED' : 'BLOCKED/FAILED');
  console.log('Ethereum Live:', e ? 'PASSED' : 'BLOCKED/FAILED');
  console.log('Base Live:', b ? 'PASSED' : 'BLOCKED/FAILED');
  console.log('Litecoin Live:', l ? 'PASSED' : 'BLOCKED/FAILED');
  console.log('Solana Live:', s ? 'PASSED' : 'BLOCKED/FAILED');
}

run();
