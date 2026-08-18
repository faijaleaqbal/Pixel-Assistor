// src/utils/crypto/embedFormatter.js
// Embed and ActionRow builder for cryptocurrency transactions.
// Strictly adheres to Discord embed specifications and design aesthetic rules.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const GREEN = 0x57F287;
const ORANGE = 0xE67E22;
const RED = 0xED4245;
const PURPLE = 0x5865F2;

function footerNow() {
  return { text: `Developed by Pixel Exchange • ${new Date().toUTCString()}` };
}

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

function formatUtcTimestamp(epochMs) {
  if (!epochMs || !Number.isFinite(epochMs)) return null;
  const d = new Date(epochMs);
  const iso = d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  const sec = Math.floor((Date.now() - epochMs) / 1000);

  let relative = '';
  if (sec < 0) relative = 'just now';
  else if (sec < 60) relative = `${sec}s ago`;
  else if (sec < 3600) relative = `${Math.floor(sec / 60)}m ago`;
  else if (sec < 86400) relative = `${Math.floor(sec / 3600)}h ago`;
  else if (sec < 86400 * 30) relative = `${Math.floor(sec / 86400)}d ago`;
  else if (sec < 86400 * 365) relative = `${Math.floor(sec / (86400 * 30))}mo ago`;
  else relative = `${Math.floor(sec / (86400 * 365))}y ago`;

  return `${iso} (${relative})`;
}

/**
 * Builds the Discord embed and components for a normalized Transaction object.
 */
function buildTransactionEmbed(tx) {
  const isConfirmed = tx.status === 'confirmed';
  const isFailed = tx.status === 'failed';
  const isPending = tx.status === 'pending';
  const color = isConfirmed ? GREEN : (isFailed ? RED : (isPending ? ORANGE : PURPLE));

  const primary = tx.primaryAsset || { symbol: 'COIN', amount: 0, type: 'Transfer' };
  const lines = [];

  // 1. Asset & Amount
  lines.push(`> **Asset:** ${primary.symbol}`);

  if (primary.decimalsUnknown || primary.decimals === null || primary.amount === null) {
    lines.push(`> **Amount:** **${primary.rawAmount || '0'} ${primary.symbol} (Decimals Unknown)**`);
    lines.push(`> ⚠️ *Token decimals could not be determined. Showing raw integer amount.*`);
  } else {
    lines.push(`> **Amount:** **${formatCryptoAmount(primary.amount, 8)} ${primary.symbol}**`);
  }

  // 2. Approx USD Value
  if (primary.usdValue != null && Number.isFinite(primary.usdValue)) {
    lines.push(`> **Approx. Value:** $${formatUsdAmount(primary.usdValue)} USD`);
  } else {
    lines.push(`> **Approx. Value:** *Price unavailable*`);
  }

  // 3. Type & Network
  const txType = tx.userContext?.direction || primary.type || 'Transfer';
  lines.push(`> **Type:** ${txType}`);
  lines.push(`> **Network:** ${tx.network}`);

  // 4. Status & Confirmations
  const statusStr = isConfirmed ? 'Confirmed ✅' : (isFailed ? 'Failed ❌' : (isPending ? 'Pending ⏳' : 'Unknown ❓'));
  lines.push(`> **Status:** ${statusStr}`);
  if (tx.confirmations > 0) {
    lines.push(`> **Confirmations:** ${tx.confirmations.toLocaleString()}`);
  } else {
    lines.push(`> **Confirmations:** 0 (Unconfirmed)`);
  }

  // 5. Fee
  if (tx.fee && tx.fee.amount > 0) {
    const feeUsdStr = tx.fee.usdValue != null ? ` (≈ $${formatUsdAmount(tx.fee.usdValue)})` : '';
    lines.push(`> **Fee:** ${formatCryptoAmount(tx.fee.amount, 8)} ${tx.fee.symbol}${feeUsdStr}`);
  }

  // 6. Timestamp
  const formattedTime = formatUtcTimestamp(tx.timestamp);
  if (formattedTime) {
    lines.push(`> **Created At:** ${formattedTime}`);
  } else {
    lines.push(`> **Created At:** *Unknown*`);
  }

  // 7. Multiple Token Transfers breakdown (if more than 1)
  if (tx.tokenTransfers.length > 1) {
    lines.push('\n**Token Transfers:**');
    for (const t of tx.tokenTransfers) {
      const usd = t.usdValue != null ? ` (≈ $${formatUsdAmount(t.usdValue)})` : '';
      const amtStr = t.decimalsUnknown || t.amount === null
        ? `${t.rawAmount || '0'} ${t.symbol} (Decimals Unknown)`
        : `${formatCryptoAmount(t.amount, 6)} ${t.symbol}`;
      lines.push(`> • **${amtStr}**${usd} — From: \`${shortAddr(t.from)}\` → To: \`${shortAddr(t.to)}\``);
    }
  }

  // 8. From & To for non-UTXO transfers (when single transfer or EVM/Solana)
  if (tx.networkKey !== 'litecoin' && tx.networkKey !== 'bitcoin') {
    const mainTransfer = tx.tokenTransfers[0] || tx.nativeTransfers[0];
    if (mainTransfer) {
      if (mainTransfer.from) lines.push(`\n**From:** \`${mainTransfer.from}\``);
      if (mainTransfer.to) lines.push(`**To:** \`${mainTransfer.to}\``);
    }
  }

  // 9. Inputs & Outputs for UTXO (e.g. Litecoin)
  if (tx.networkKey === 'litecoin' || tx.networkKey === 'bitcoin') {
    lines.push('\n**Inputs:**');
    if (tx.inputs.length > 0) {
      for (const inp of tx.inputs.slice(0, 5)) {
        const addrStr = inp.address && inp.address !== 'Unknown' ? `\`${shortAddr(inp.address)}\`` : '`Unknown`';
        const amtStr = inp.amount > 0 ? ` — ${formatCryptoAmount(inp.amount, 8)} ${inp.symbol}` : '';
        lines.push(`> ${addrStr}${amtStr}`);
      }
      if (tx.inputs.length > 5) {
        lines.push(`> *... and ${tx.inputs.length - 5} more inputs*`);
      }
    } else {
      lines.push('> `Unknown`');
    }

    lines.push('\n**Outputs:**');
    if (tx.outputs.length > 0) {
      for (const out of tx.outputs.slice(0, 5)) {
        const addrStr = out.address && out.address !== 'Unknown' ? `\`${shortAddr(out.address)}\`` : '`Unknown`';
        const amtStr = out.amount > 0 ? ` — ${formatCryptoAmount(out.amount, 8)} ${out.symbol}` : '';
        lines.push(`> ${addrStr}${amtStr}`);
      }
      if (tx.outputs.length > 5) {
        lines.push(`> *... and ${tx.outputs.length - 5} more outputs*`);
      }
    } else {
      lines.push('> `Unknown`');
    }
  }

  // 10. Tx Hash / Signature
  lines.push(`\n**Tx Hash:** \`${tx.txHash}\``);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${tx.network} Transaction Details`)
    .setDescription(lines.join('\n'))
    .setFooter(footerNow())
    .setTimestamp(tx.timestamp ? new Date(tx.timestamp) : new Date());

  const components = [];
  if (tx.explorerTxUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('View on Explorer')
          .setStyle(ButtonStyle.Link)
          .setURL(tx.explorerTxUrl)
          .setEmoji('🔗')
      )
    );
  }

  return { embeds: [embed], components };
}

module.exports = {
  buildTransactionEmbed,
  formatCryptoAmount,
  formatUsdAmount,
  formatUtcTimestamp,
  shortAddr,
  footerNow,
};
