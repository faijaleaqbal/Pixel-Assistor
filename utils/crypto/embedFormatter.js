// src/utils/crypto/embedFormatter.js
// Embed and ActionRow builder for cryptocurrency transactions.
// Strictly adheres to Discord embed specifications and design aesthetic rules.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const responseBuilder = require('../responseBuilder');

const GREEN = 0x57F287;
const ORANGE = 0xE67E22;
const RED = 0xED4245;
const PURPLE = 0x5865F2;

function formatCryptoAmount(num, maxDecimals = 8) {
  if (typeof num !== 'number' || !Number.isFinite(num)) return '0';
  const str = num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
    useGrouping: true,
  });
  return str;
}

function formatUsdAmount(num) {
  if (typeof num !== 'number' || !Number.isFinite(num)) return null;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}

function shortAddr(addr) {
  if (!addr || addr === 'Unknown') return 'Unknown';
  const s = String(addr);
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

/**
 * Builds the Discord embed and components for a normalized Transaction object.
 */
function buildTransactionEmbed(tx, client) {
  const isConfirmed = tx.status === 'confirmed';
  const isFailed = tx.status === 'failed';
  const isPending = tx.status === 'pending';
  const color = isConfirmed ? GREEN : (isFailed ? RED : (isPending ? ORANGE : PURPLE));
  const emoji = isConfirmed ? '✅' : (isFailed ? '❌' : (isPending ? '⏳' : '🔍'));

  const primary = tx.primaryAsset || { symbol: 'COIN', amount: 0, type: 'Transfer' };
  const fields = [];

  // 1. Asset & Amount
  fields.push({ name: 'Asset', value: primary.symbol });

  if (primary.decimalsUnknown || primary.decimals === null || primary.amount === null) {
    fields.push({ name: 'Amount', value: `**${primary.rawAmount || '0'} ${primary.symbol} (Decimals Unknown)**` });
  } else {
    fields.push({ name: 'Amount', value: `**${formatCryptoAmount(primary.amount, 8)} ${primary.symbol}**` });
  }

  // 2. Approx USD Value
  if (primary.usdValue != null && Number.isFinite(primary.usdValue)) {
    fields.push({ name: 'Approx. Value', value: `$${formatUsdAmount(primary.usdValue)} USD` });
  } else {
    fields.push({ name: 'Approx. Value', value: '*Price unavailable*' });
  }

  // 3. Type & Network
  const txType = tx.userContext?.direction || primary.type || 'Transfer';
  fields.push({ name: 'Type', value: txType });
  fields.push({ name: 'Network', value: tx.network });

  // 4. Status & Confirmations
  const statusStr = isConfirmed ? 'Confirmed ✅' : (isFailed ? 'Failed ❌' : (isPending ? 'Pending ⏳' : 'Unknown ❓'));
  fields.push({ name: 'Status', value: statusStr });
  if (tx.confirmations > 0) {
    fields.push({ name: 'Confirmations', value: tx.confirmations.toLocaleString() });
  } else {
    fields.push({ name: 'Confirmations', value: '0 (Unconfirmed)' });
  }

  // 5. Fee
  if (tx.fee && tx.fee.amount > 0) {
    const feeUsdStr = tx.fee.usdValue != null ? ` (≈ $${formatUsdAmount(tx.fee.usdValue)})` : '';
    fields.push({ name: 'Fee', value: `${formatCryptoAmount(tx.fee.amount, 8)} ${tx.fee.symbol}${feeUsdStr}` });
  }

  // 6. Timestamp
  if (tx.timestamp) {
    const unix = Math.floor(tx.timestamp / 1000);
    fields.push({ name: 'Created At', value: `<t:${unix}:f> (<t:${unix}:R>)` });
  } else {
    fields.push({ name: 'Created At', value: '*Unknown*' });
  }

  // Extra content for UTXO inputs/outputs or token transfers
  const extraParts = [];
  if (primary.decimalsUnknown) {
    extraParts.push('*Token decimals could not be determined. Showing raw integer amount.*');
  }

  if (tx.tokenTransfers && tx.tokenTransfers.length > 1) {
    extraParts.push('**Token Transfers:**');
    for (const t of tx.tokenTransfers) {
      const usd = t.usdValue != null ? ` (≈ $${formatUsdAmount(t.usdValue)})` : '';
      const amtStr = t.decimalsUnknown || t.amount === null
        ? `${t.rawAmount || '0'} ${t.symbol} (Decimals Unknown)`
        : `${formatCryptoAmount(t.amount, 6)} ${t.symbol}`;
      extraParts.push(responseBuilder.formatLine(`**${amtStr}**${usd} — From: \`${shortAddr(t.from)}\` → To: \`${shortAddr(t.to)}\``));
    }
  }

  // From & To for non-UTXO transfers
  if (tx.networkKey !== 'litecoin' && tx.networkKey !== 'bitcoin') {
    const mainTransfer = (tx.tokenTransfers && tx.tokenTransfers[0]) || (tx.nativeTransfers && tx.nativeTransfers[0]);
    if (mainTransfer) {
      if (mainTransfer.from) fields.push({ name: 'From', value: `\`${mainTransfer.from}\`` });
      if (mainTransfer.to) fields.push({ name: 'To', value: `\`${mainTransfer.to}\`` });
    }
  }

  // Inputs & Outputs for UTXO (e.g. Litecoin)
  if (tx.networkKey === 'litecoin' || tx.networkKey === 'bitcoin') {
    if (tx.inputs && tx.inputs.length > 0) {
      const inpLines = [];
      for (const inp of tx.inputs.slice(0, 5)) {
        const addrStr = inp.address && inp.address !== 'Unknown' ? `\`${shortAddr(inp.address)}\`` : '`Unknown`';
        const amtStr = inp.amount > 0 ? ` — ${formatCryptoAmount(inp.amount, 8)} ${inp.symbol}` : '';
        inpLines.push(responseBuilder.formatLine(`${addrStr}${amtStr}`));
      }
      if (tx.inputs.length > 5) {
        inpLines.push(responseBuilder.formatLine(`*... and ${tx.inputs.length - 5} more inputs*`));
      }
      extraParts.push('**Inputs:**\n' + inpLines.join('\n'));
    } else if (tx.inputs) {
      extraParts.push('**Inputs:**\n' + responseBuilder.formatLine('`Unknown`'));
    }

    if (tx.outputs && tx.outputs.length > 0) {
      const outLines = [];
      for (const out of tx.outputs.slice(0, 5)) {
        const addrStr = out.address && out.address !== 'Unknown' ? `\`${shortAddr(out.address)}\`` : '`Unknown`';
        const amtStr = out.amount > 0 ? ` — ${formatCryptoAmount(out.amount, 8)} ${out.symbol}` : '';
        outLines.push(responseBuilder.formatLine(`${addrStr}${amtStr}`));
      }
      if (tx.outputs.length > 5) {
        outLines.push(responseBuilder.formatLine(`*... and ${tx.outputs.length - 5} more outputs*`));
      }
      extraParts.push('**Outputs:**\n' + outLines.join('\n'));
    } else if (tx.outputs) {
      extraParts.push('**Outputs:**\n' + responseBuilder.formatLine('`Unknown`'));
    }
  }

  if (tx.txHash) {
    fields.push({ name: 'Tx Hash', value: `\`${tx.txHash}\`` });
  }

  const container = responseBuilder.buildResult({
    title: `${tx.network} Transaction`,
    emoji,
    color,
    fields,
    content: extraParts.length ? extraParts.join('\n\n') : undefined,
    client,
  });

  if (tx.explorerTxUrl) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('View on Explorer')
          .setStyle(ButtonStyle.Link)
          .setURL(tx.explorerTxUrl)
          .setEmoji('🔗')
      )
    );
  }

  return { container };
}

module.exports = {
  buildTransactionEmbed,
  formatCryptoAmount,
  formatUsdAmount,
  shortAddr,
};
