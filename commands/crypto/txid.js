// src/commands/crypto/txid.js
// ?txid <hash>  (alias ?tx) — Multi-chain transaction lookup.
//
// Chain detection:
//   • EVM (0x + 64 hex) → ambiguous: Polygon / BNB Chain / Ethereum.
//       Show a StringSelectMenu; on selection, query the matching Etherscan-family API.
//   • Solana signature (base58, ~83-89 chars) → Helius enhanced API.
//   • 64-char hex (no 0x) → ambiguous: Litecoin (BlockCypher) OR Tron (TronGrid).
//       Try TronGrid first; on 404 / empty, fall back to BlockCypher LTC.
//   • Unknown format → clear error, no API call.
//
// Final embed ("Ambiguous Transaction" / "<Chain> Transaction Details"):
//   > Total Amount: <amount> <TOKEN>
//   > Approx. Value: $<usd> USD
//   > Created At: <relative>
//   > Confirmed: ✅ / ❌
//   Inputs:  > <from>
//   Outputs: > <to>
//            > <amount> <TOKEN> (≈ $<usd>)
//   Footer: "Developed by Pixel Exchange • <timestamp>"
//   Button: "View on Explorer 🔗"

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../../utils/config');
const {
  detectTxChain,
  evmFetchTx,
  tronFetchTx,
  solanaFetchTx,
  litecoinFetchTx,
  getUsdPrice,
} = require('../../utils/cryptoApi');
const { ownerName } = require('../../utils/embeds');

// Verbose diagnostic logger from cryptoApi — only prints when DEBUG env var is set.
const dbg = (...args) => { if (process.env.DEBUG) console.log(...args); };

const PURPLE = 0x5865F2, GREEN = 0x57F287, RED = 0xED4245, YELLOW = 0xFEE75C, ORANGE = 0xE67E22;

// In-memory state: messageId -> { hash, kind: 'tx', at: timestamp }
// Used by interactionCreate to route the network-select menu back here.
const state = new Map();

const EVM_OPTIONS = [
  { value: 'polygon',  label: 'Polygon',       emoji: '🟣' },
  { value: 'bnb',      label: 'BNB Chain',     emoji: '🟡' },
  { value: 'ethereum', label: 'Ethereum',     emoji: '🔷' },
];

function footerNow() {
  return { text: `Developed by Pixel Exchange • ${new Date().toLocaleString()}` };
}

function relativeTime(ts) {
  if (!ts) return 'Unknown';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`;
  if (sec < 86400 * 365) return `${Math.floor(sec / 86400 / 30)}mo ago`;
  return `${Math.floor(sec / 86400 / 365)}y ago`;
}

function formatNumber(n, decimals = 6) {
  if (typeof n !== 'number' || !Number.isFinite(n)) n = 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function shortAddr(addr) {
  if (!addr) return '—';
  const s = String(addr);
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

function buildNetworkSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('txid_network_select')
      .setPlaceholder('Select the Network...')
      .addOptions(EVM_OPTIONS.map((o) => ({ label: o.label, value: o.value, emoji: o.emoji })))
  );
}

function buildAmbiguousEmbed(hash) {
  return new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle('Ambiguous Transaction')
    .setDescription(
      `> This hash matches multiple EVM chains.\n` +
      `> Select the correct network below.\n\n` +
      `\`\`\`${hash}\`\`\``
    )
    .setFooter(footerNow())
    .setTimestamp();
}

/**
 * Helper: safely compute USD value. Returns a finite number or null.
 * Sets tx.priceUnavailable = true when price is not available.
 */
async function safeUsdValue(tx, coinId, amount) {
  if (!amount) return null;
  try {
    const price = await getUsdPrice(coinId);
    if (price == null) {
      console.warn(`[txid] safeUsdValue: no price for ${coinId}, skipping Approx. Value line`);
      tx.priceUnavailable = true;
      return null;
    }
    return amount * price;
  } catch (e) {
    console.error(`[txid] safeUsdValue(${coinId}) failed: ${e.message}`);
    tx.priceUnavailable = true;
    return null;
  }
}

/**
 * Build the final transaction embed.
 * BUG 5 fix: iterates over tx.inputs[] and tx.outputs[] arrays
 * instead of only using single tx.from / tx.to.
 */
function buildTxEmbed(tx) {
  const lines = [];
  lines.push(`> Total Amount: **${formatNumber(tx.value, tx.decimals || 6)} ${tx.symbol}**`);
  if (tx.usdValue != null && Number.isFinite(tx.usdValue)) {
    lines.push(`> Approx. Value: **$${formatNumber(tx.usdValue, 2)} USD**`);
  } else if (tx.priceUnavailable) {
    lines.push('> Approx. Value: *Price unavailable*');
  }
  lines.push(`> Created At: **${relativeTime(tx.timestamp)}**`);
  lines.push(`> Confirmed: ${tx.confirmed ? '✅' : '❌'}`);

  // BUG 5 fix: iterate over inputs/outputs arrays.
  lines.push('Inputs:');
  const inputsList = (tx.inputs && tx.inputs.length) ? tx.inputs : (tx.from ? [{ address: tx.from }] : []);
  if (inputsList.length) {
    for (const inp of inputsList) {
      const addr = shortAddr(inp.address);
      if (inp.value != null && inp.value > 0) {
        lines.push(`> \`${addr}\`  ${formatNumber(inp.value, tx.decimals || 6)} ${tx.symbol}`);
      } else {
        lines.push(`> \`${addr}\``);
      }
    }
  } else {
    lines.push('> `—`');
  }

  lines.push('Outputs:');
  const outputsList = (tx.outputs && tx.outputs.length) ? tx.outputs : (tx.to ? [{ address: tx.to }] : []);
  if (outputsList.length) {
    for (const out of outputsList) {
      const addr = shortAddr(out.address);
      let valStr = '';
      if (out.value != null && out.value > 0) {
        valStr = `  ${formatNumber(out.value, tx.decimals || 6)} ${tx.symbol}`;
        if (tx.usdValue != null && Number.isFinite(tx.usdValue) && tx.value > 0) {
          // Pro-rate USD for this output.
          const outUsd = (out.value / tx.value) * tx.usdValue;
          valStr += ` (≈ $${formatNumber(outUsd, 2)})`;
        }
      }
      lines.push(`> \`${addr}\`${valStr}`);
    }
  } else {
    lines.push('> `—`');
  }

  const e = new EmbedBuilder()
    .setColor(tx.confirmed ? GREEN : ORANGE)
    .setTitle(`${tx.chain} Transaction Details`)
    .setDescription(lines.join('\n'))
    .setFooter(footerNow())
    .setTimestamp();

  if (tx.explorerTxUrl) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View on Explorer')
        .setStyle(ButtonStyle.Link)
        .setURL(tx.explorerTxUrl)
        .setEmoji('🔗')
    );
    return { embeds: [e], components: [row] };
  }
  return { embeds: [e] };
}

module.exports = {
  name: 'txid',
  aliases: ['tx'],
  category: 'crypto',
  description: 'Look up a transaction across Polygon, BNB, ETH, LTC, SOL, TRC20.',
  usage: '<hash>',
  cooldown: 5,
  args: true,
  async execute(message, args) {
    const hash = String(args[0] || '').trim();
    if (!hash) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`Usage: \`${config.prefix}txid <hash>\` (or \`${config.prefix}tx <hash>\`)`)] });
    }

    const detected = detectTxChain(hash);

    if (detected.type === 'unknown') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setTitle('Invalid Hash')
        .setDescription('Invalid or unrecognized transaction hash format.\nSupported: EVM (`0x…` 66 chars), Solana signature (base58 ~88 chars), Litecoin/Tron (64-char hex).')
        .setFooter(footerNow())
        .setTimestamp()] });
    }

    // ── EVM-ambiguous: show the network select menu ──
    if (detected.type === 'evm') {
      const embed = buildAmbiguousEmbed(hash);
      const row = buildNetworkSelect();
      const sent = await message.reply({ embeds: [embed], components: [row] });
      state.set(sent.id, { hash, kind: 'tx', at: Date.now(), invokerId: message.author.id });
      // Auto-expire state after 5 minutes.
      setTimeout(() => state.delete(sent.id), 5 * 60_000).unref?.();
      return;
    }

    // ── Solana: direct lookup ──
    if (detected.type === 'solana') {
      const m = await message.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setDescription('⏳ Querying Solana (Helius)…').setFooter(footerNow())] });
      try {
        const tx = await solanaFetchTx(hash);
        if (!tx) return m.edit({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`No Solana transaction found for \`${hash.slice(0, 16)}…\``)] });
        // BUG 4 fix: use safeUsdValue to avoid NaN when price is null
        tx.usdValue = await safeUsdValue(tx, 'solana', tx.value);
        dbg(`[txid] Solana tx value=${tx.value} usdValue=${tx.usdValue} inputs=${tx.inputs?.length} outputs=${tx.outputs?.length}`);
        return m.edit(buildTxEmbed(tx));
      } catch (e) {
        console.error(`[txid] Solana lookup failed: ${e.message}`, e);
        return m.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`Solana lookup failed: **${e.message}**`)] });
      }
    }

    // ── 64-char hex: try Tron first, then fall back to Litecoin ──
    if (detected.type === 'hex64') {
      const m = await message.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setDescription('⏳ Detecting chain (Tron → Litecoin fallback)…').setFooter(footerNow())] });
      // Try Tron first.
      if (config.trongridApiKey) {
        try {
          const tx = await tronFetchTx(hash);
          if (tx) {
            const coinId = tx.symbol === 'USDT' ? 'tether' : 'tron';
            tx.usdValue = await safeUsdValue(tx, coinId, tx.value);
            dbg(`[txid] Tron tx value=${tx.value} usdValue=${tx.usdValue} inputs=${tx.inputs?.length} outputs=${tx.outputs?.length}`);
            return m.edit(buildTxEmbed(tx));
          }
        } catch (e) {
          console.error(`[txid] Tron lookup error (falling back to LTC): ${e.message}`);
          /* fall through to Litecoin */
        }
      }
      // Fall back to BlockCypher LTC.
      if (config.blockcypherToken) {
        try {
          const tx = await litecoinFetchTx(hash);
          if (tx) {
            // BUG 4 fix: use safeUsdValue to avoid NaN when price is null
            tx.usdValue = await safeUsdValue(tx, 'litecoin', tx.value);
            dbg(`[txid] LTC tx value=${tx.value} usdValue=${tx.usdValue} inputs=${tx.inputs?.length} outputs=${tx.outputs?.length}`);
            return m.edit(buildTxEmbed(tx));
          }
          return m.edit({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`No transaction found on Tron or Litecoin for \`${hash.slice(0, 16)}…\``)] });
        } catch (e) {
          console.error(`[txid] Litecoin lookup failed: ${e.message}`, e);
          return m.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`Litecoin lookup failed: **${e.message}**`)] });
        }
      }
      return m.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription('Neither TronGrid nor BlockCypher is configured. Set `TRONGRID_API_KEY` or `BLOCKCYPHER_TOKEN`.')] });
    }
  },

  // Called from interactionCreate when the user picks a network.
  async handleInteraction(interaction, client) {
    try {
      if (!interaction.isStringSelectMenu() || interaction.customId !== 'txid_network_select') return;
      const st = state.get(interaction.message.id);
      if (!st) {
        return interaction.update({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('This lookup has expired. Run `?txid <hash>` again.')], components: [] });
      }
      // Only the original invoker can pick the network — prevents other users in
      // the channel from triggering API calls on the invoker's behalf.
      if (interaction.user.id !== st.invokerId) {
        return interaction.reply({ content: 'Only the user who ran `?txid` can pick the network.', ephemeral: true });
      }
      const chainKey = interaction.values[0];
      const opt = EVM_OPTIONS.find((o) => o.value === chainKey);
      if (!opt) return interaction.deferUpdate?.().catch(() => {});

      // Log which chain was selected and confirm the mapping (DEBUG only).
      dbg(`[txid] EVM chain selected: chainKey="${chainKey}" label="${opt.label}" hash="${st.hash.slice(0, 16)}…"`);

      // 1. Edit to "Processing selection..."
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(PURPLE).setDescription(`Processing selection... (${opt.label})`).setFooter(footerNow())],
        components: [],
      });

      try {
        const tx = await evmFetchTx(chainKey, st.hash);
        if (!tx) {
          return interaction.message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
            .setTitle('Transaction Not Found')
            .setDescription(`No ${opt.label} transaction found for \`${st.hash.slice(0, 16)}…\``)
            .setFooter(footerNow())
            .setTimestamp()] }).catch(() => {});
        }
        // Fetch live USD price for native coin.
        const coinId = evmCoinId(chainKey);
        if (coinId) {
          tx.usdValue = await safeUsdValue(tx, coinId, tx.value);
        }
        dbg(`[txid] EVM ${chainKey} tx value=${tx.value} usdValue=${tx.usdValue} from=${tx.from} to=${tx.to} inputs=${tx.inputs?.length} outputs=${tx.outputs?.length}`);
        await interaction.message.edit(buildTxEmbed(tx));
      } catch (e) {
        console.error(`[txid] ${opt.label} lookup failed: ${e.message}`, e);
        await interaction.message.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`${opt.label} lookup failed: **${e.message}**`)] }).catch(() => {});
      } finally {
        state.delete(interaction.message.id);
      }
    } catch (e) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'TX lookup error: ' + (e?.message || 'unknown'), ephemeral: true }).catch(() => {});
        }
      } catch { /* ignore */ }
    }
  },
};

function evmCoinId(chainKey) {
  if (chainKey === 'polygon') return 'matic-network';
  if (chainKey === 'bnb') return 'binancecoin';
  if (chainKey === 'ethereum') return 'ethereum';
  return null;
}

// Allow interactionCreate to call this module as a function (for routing parity with help).
module.exports.default = async function (interaction, client) {
  return module.exports.handleInteraction(interaction, client);
};
