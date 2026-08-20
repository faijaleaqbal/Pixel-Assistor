const responseBuilder = require('../../utils/responseBuilder');
// src/commands/crypto/bal.js
// ?bal <address> — Multi-chain wallet balance lookup.
//
// Chain detection:
//   • EVM (0x + 40 hex) → ambiguous: Polygon / BNB / Ethereum.
//       Show "Which Chain?" embed + StringSelectMenu; on selection, fetch the
//       matching chain's native coin balance + USDT (Polygon-ERC20 / BEP20) balance.
//   • Tron (T-prefixed base58) → TronGrid — TRX + TRC20 USDT balance.
//   • Litecoin (L/M/3/ltc1) → BlockCypher LTC balance (confirmed / unconfirmed / total).
//   • Solana (base58, 32-44 chars) → Helius RPC SOL balance.
//   • Unknown format → clear error, no API call.
//
// Embed format:
//   Title: "<Chain> Wallet Balance"
//   Balances:
//   > Confirmed: <amount> <NATIVE> ($<usd>)
//   > Unconfirmed: <amount> <NATIVE> ($<usd>)
//   > Total: <amount> <NATIVE> ($<usd>)
//   > USDT: <amount> USDT ($<usd>)     ← only when balance > 0
//   Address:
//   > <full address>
//   Footer: "Developed by Pixel Exchange • <timestamp>"
//   Button: "View Address 🔗"

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../../utils/config');
const {
  detectAddressChain,
  evmFetchBalance,
  tronFetchBalance,
  solanaFetchBalance,
  litecoinFetchBalance,
  getUsdPrice,
} = require('../../utils/cryptoApi');

const PURPLE = 0x5865F2, GREEN = 0x57F287, RED = 0xED4245, YELLOW = 0xFEE75C;

// messageId -> { address, kind: 'bal' }
const state = new Map();

const EVM_OPTIONS = [
  { value: 'polygon',  label: 'Polygon',     emoji: '🟣' },
  { value: 'bnb',      label: 'BNB Chain',   emoji: '🟡' },
  { value: 'ethereum', label: 'Ethereum',   emoji: '🔷' },
];

function footerNow() {
  return { text: `Developed by Pixel Exchange • ${new Date().toLocaleString()}` };
}

function shortAddr(addr) {
  if (!addr) return '—';
  const s = String(addr);
  if (s.length <= 14) return s;
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

function fmt(n, decimals = 6) {
  if (typeof n !== 'number' || !Number.isFinite(n)) n = 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function buildNetworkSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bal_network_select')
      .setPlaceholder('Select the Network...')
      .addOptions(EVM_OPTIONS.map((o) => ({ label: o.label, value: o.value, emoji: o.emoji })))
  );
}

function buildAmbiguousEmbed(address) {
  return responseBuilder.buildResult({ title: 'Which Chain?', description: `> Address: \`${shortAddr(address)}\`\n` +
      `> This address matches multiple EVM chains.\n` +
      `> Select the correct network below.`});
}

function buildBalanceEmbed(b) {
  const lines = [];
  lines.push(`Balances:`);
  // Solana & Tron & EVM chains don't distinguish confirmed/unconfirmed in our data,
  // but Litecoin does. We render uniformly: when unconfirmed is null/0, show 0.
  const confirmed = b.nativeBalance ?? 0;
  const unconfirmed = b.nativeUnconfirmed ?? 0;
  const total = b.nativeTotal ?? confirmed;

  const usd = b.usdPerNative;
  const usdConfirmed = (usd != null && Number.isFinite(usd)) ? confirmed * usd : null;
  const usdUnconfirmed = (usd != null && Number.isFinite(usd)) ? unconfirmed * usd : null;
  const usdTotal = (usd != null && Number.isFinite(usd)) ? total * usd : null;
  const priceUnavailable = (usd == null && b.nativeCoinId);

  lines.push(`> Confirmed: **${fmt(confirmed, 8)} ${b.nativeSymbol}**${usdConfirmed != null ? ` ($${fmt(usdConfirmed, 2)})` : ''}`);
  lines.push(`> Unconfirmed: **${fmt(unconfirmed, 8)} ${b.nativeSymbol}**${usdUnconfirmed != null ? ` ($${fmt(usdUnconfirmed, 2)})` : ''}`);
  lines.push(`> Total: **${fmt(total, 8)} ${b.nativeSymbol}**${usdTotal != null ? ` ($${fmt(usdTotal, 2)})` : ''}`);

  if (b.usdtBalance && b.usdtBalance > 0) {
    const usdtUsd = b.usdtUsd ?? 1; // USDT is approximately $1
    const usdtUsdVal = (usdtUsd != null && Number.isFinite(usdtUsd)) ? usdtUsd : 1;
    lines.push(`> USDT: **${fmt(b.usdtBalance, 6)} USDT** ($${fmt(b.usdtBalance * usdtUsdVal, 2)})`);
  }

  if (priceUnavailable) {
    lines.push('> *USD price unavailable — check COINGECKO_DEMO_API_KEY in .env*');
  }

  lines.push(`Address:`);
  lines.push(`> \`${b.address}\``);

  const e = responseBuilder.buildResult({ title: `${b.chain} Wallet Balance`, description: lines.join('\n')});

  if (b.explorerAddrUrl) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View Address')
        .setStyle(ButtonStyle.Link)
        .setURL(b.explorerAddrUrl)
        .setEmoji('🔗')
    );
    return { embeds: [e], components: [row] };
  }
  return { embeds: [e] };
}

module.exports = {
  name: 'bal',
  aliases: ['balance', 'b'],
  category: 'crypto',
  description: 'Check wallet balance across Polygon, BNB, ETH, LTC, SOL, TRC20.',
  usage: '<address>',
  cooldown: 5,
  args: true,
  async execute(message, args, client) {
    const address = String(args[0] || '').trim();
    if (!address) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `Usage: \`${config.prefix}bal <address>\``})] });
    }

    const detected = detectAddressChain(address);

    if (detected.type === 'unknown') {
      return message.reply({ embeds: [responseBuilder.buildResult({ title: 'Invalid Address', description: 'Invalid or unrecognized wallet address format.\nSupported: EVM (`0x…` 42 chars), Tron (`T…`), Litecoin (`L…`/`M…`/`3…`/`ltc1…`), Solana (base58 32-44 chars).'})] });
    }

    // ── EVM-ambiguous: show the network select menu ──
    if (detected.type === 'evm') {
      const embed = buildAmbiguousEmbed(address);
      const row = buildNetworkSelect();
      const sent = await message.reply({ embeds: [embed], components: [row] });
      state.set(sent.id, { address, kind: 'bal', at: Date.now(), invokerId: message.author.id });
      setTimeout(() => state.delete(sent.id), 5 * 60_000).unref?.();
      return;
    }

    // ── Direct lookups for non-ambiguous chains ──
    const m = await message.reply({ embeds: [responseBuilder.buildResult({ description: `⏳ Fetching ${detected.type === 'tron' ? 'Tron' : detected.type === 'litecoin' ? 'Litecoin' : 'Solana'} balance…`})] });

    try {
      let bal;
      if (detected.type === 'tron') bal = await tronFetchBalance(address);
      else if (detected.type === 'litecoin') bal = await litecoinFetchBalance(address);
      else if (detected.type === 'solana') bal = await solanaFetchBalance(address);
      else throw new Error('Unsupported address type.');

      // Attach live USD price for native coin (best-effort, never throws).
      const coinId = bal.nativeCoinId;
      if (coinId) {
        try { bal.usdPerNative = await getUsdPrice(coinId); } catch { bal.usdPerNative = null; }
      }
      // USDT is approximately $1 — use CoinGecko's tether price for accuracy.
      if (bal.usdtBalance > 0) {
        try { bal.usdtUsd = await getUsdPrice('tether'); } catch { bal.usdtUsd = 1; }
      }
      return m.edit(buildBalanceEmbed(bal));
    } catch (e) {
      return m.edit({ embeds: [responseBuilder.buildResult({ description: `Balance lookup failed: **${e.message}**`})] });
    }
  },

  // Called from interactionCreate when the user picks a network.
  async handleInteraction(interaction, _client) {
    try {
      if (!interaction.isStringSelectMenu() || interaction.customId !== 'bal_network_select') return;
      const st = state.get(interaction.message.id);
      if (!st) {
        return interaction.update({ embeds: [responseBuilder.buildResult({ description: 'This lookup has expired. Run `?bal <address>` again.'})], components: [] });
      }
      // Only the original invoker can pick the network — prevents other users in
      // the channel from triggering API calls on the invoker's behalf.
      if (interaction.user.id !== st.invokerId) {
        return interaction.reply({ content: 'Only the user who ran `?bal` can pick the network.', ephemeral: true });
      }
      const chainKey = interaction.values[0];
      const opt = EVM_OPTIONS.find((o) => o.value === chainKey);
      if (!opt) return interaction.deferUpdate?.().catch(() => {});

      // Edit to "Fetching <Chain> balance..."
      await interaction.update({
        embeds: [responseBuilder.buildResult({ description: `Fetching ${opt.label} balance…`})],
        components: [],
      });

      try {
        const bal = await evmFetchBalance(chainKey, st.address);
        const coinId = bal.nativeCoinId;
        if (coinId) {
          try { bal.usdPerNative = await getUsdPrice(coinId); } catch { bal.usdPerNative = null; }
        }
        if (bal.usdtBalance > 0) {
          try { bal.usdtUsd = await getUsdPrice('tether'); } catch { bal.usdtUsd = 1; }
        }
        await interaction.message.edit(buildBalanceEmbed(bal));
      } catch (e) {
        await interaction.message.edit({ embeds: [responseBuilder.buildResult({ description: `${opt.label} balance lookup failed: **${e.message}**`})] }).catch(() => {});
      } finally {
        state.delete(interaction.message.id);
      }
    } catch (e) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Balance lookup error: ' + (e?.message || 'unknown'), ephemeral: true }).catch(() => {});
        }
      } catch { /* ignore */ }
    }
  },
};

// Allow interactionCreate to call this module as a function (for routing parity with help).
module.exports.default = async function (interaction, client) {
  return module.exports.handleInteraction(interaction, client);
};
