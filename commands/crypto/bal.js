const responseBuilder = require('../../utils/responseBuilder');
// src/commands/crypto/bal.js
// ?bal [network] <address> — Multi-chain wallet balance lookup.
//
// Supports:
//   • EVM Chains (Polygon, BNB Chain, Ethereum, Arbitrum, Base, Optimism)
//   • Bitcoin (BTC) — Bech32 (bc1), Legacy (1), P2SH (3)
//   • Dogecoin (DOGE) — (D, A, 9)
//   • Litecoin (LTC) — (L, M, 3, ltc1)
//   • Tron (TRX) — TRX + TRC-20 tokens (USDT, USDC, etc.)
//   • Solana (SOL) — SOL + SPL tokens (USDT, USDC, etc.)

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../../utils/config');
const { opts, buildContainer } = require('../../utils/v2Reply');
const {
  detectAddressChain,
  evmFetchBalance,
  tronFetchBalance,
  solanaFetchBalance,
  litecoinFetchBalance,
  bitcoinFetchBalance,
  dogecoinFetchBalance,
  getUsdPrice,
} = require('../../utils/cryptoApi');
const { normalizeNetworkName } = require('../../utils/crypto/networkDetector');

// messageId -> { address, kind: 'bal', invokerId, at }
const state = new Map();

const EVM_OPTIONS = [
  { value: 'polygon',  label: 'Polygon',      emoji: '🟣', description: 'Polygon PoS (POL / MATIC)' },
  { value: 'bnb',      label: 'BNB Chain',    emoji: '🟡', description: 'BNB Smart Chain (BNB)' },
  { value: 'ethereum', label: 'Ethereum',     emoji: '🔷', description: 'Ethereum Mainnet (ETH)' },
  { value: 'arbitrum', label: 'Arbitrum One', emoji: '🔵', description: 'Arbitrum Layer 2 (ETH)' },
  { value: 'base',     label: 'Base',         emoji: '🟦', description: 'Base Layer 2 (ETH)' },
  { value: 'optimism', label: 'Optimism',     emoji: '🔴', description: 'Optimism Mainnet (ETH)' },
];

const UTXO_P2SH_OPTIONS = [
  { value: 'bitcoin',  label: 'Bitcoin',  emoji: '🪙', description: 'Bitcoin Mainnet (BTC)' },
  { value: 'litecoin', label: 'Litecoin', emoji: '⚪', description: 'Litecoin Mainnet (LTC)' },
];

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

function buildEvmSelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bal_network_select')
      .setPlaceholder('Select EVM Network...')
      .addOptions(EVM_OPTIONS.map((o) => ({ label: o.label, value: o.value, emoji: o.emoji, description: o.description })))
  );
}

function buildUtxoSelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bal_network_select')
      .setPlaceholder('Select Network (Bitcoin / Litecoin)...')
      .addOptions(UTXO_P2SH_OPTIONS.map((o) => ({ label: o.label, value: o.value, emoji: o.emoji, description: o.description })))
  );
}

function buildAmbiguousEmbed(address, type = 'EVM') {
  return responseBuilder.buildResult({
    title: `Which Chain? (${type})`,
    description: `> Address: \`${shortAddr(address)}\`\n` +
      `> This address matches multiple networks.\n` +
      `> Select the correct network below to look up the balance.`,
  });
}

async function buildBalanceEmbed(b) {
  const lines = [];
  lines.push(`Balances:`);

  const confirmed = b.nativeBalance ?? 0;
  const unconfirmed = b.nativeUnconfirmed ?? 0;
  const total = b.nativeTotal ?? confirmed;

  const usd = b.usdPerNative;
  const usdConfirmed = (usd != null && Number.isFinite(usd)) ? confirmed * usd : null;
  const usdUnconfirmed = (usd != null && Number.isFinite(usd)) ? unconfirmed * usd : null;
  const usdTotal = (usd != null && Number.isFinite(usd)) ? total * usd : null;
  const priceUnavailable = (usd == null && b.nativeCoinId);

  lines.push(`> Confirmed: **${fmt(confirmed, 8)} ${b.nativeSymbol}**${usdConfirmed != null ? ` ($${fmt(usdConfirmed, 2)})` : ''}`);
  if (unconfirmed !== 0 || b.chainKey === 'litecoin' || b.chainKey === 'bitcoin' || b.chainKey === 'dogecoin') {
    lines.push(`> Unconfirmed: **${fmt(unconfirmed, 8)} ${b.nativeSymbol}**${usdUnconfirmed != null ? ` ($${fmt(usdUnconfirmed, 2)})` : ''}`);
    lines.push(`> Total: **${fmt(total, 8)} ${b.nativeSymbol}**${usdTotal != null ? ` ($${fmt(usdTotal, 2)})` : ''}`);
  }

  // Render Token Balances (USDT, USDC, DAI, etc.)
  if (Array.isArray(b.tokenBalances) && b.tokenBalances.length > 0) {
    for (const t of b.tokenBalances) {
      if (t.balance > 0) {
        let tUsd = t.usdValue;
        if (tUsd == null && t.coinId) {
          try {
            const p = await getUsdPrice(t.coinId);
            if (p) tUsd = t.balance * p;
          } catch {}
        } else if (tUsd == null && (t.symbol === 'USDT' || t.symbol === 'USDC' || t.symbol === 'DAI')) {
          tUsd = t.balance; // Stablecoins peg at ~1 USD
        }
        lines.push(`> ${t.symbol}: **${fmt(t.balance, 6)} ${t.symbol}**${tUsd != null ? ` ($${fmt(tUsd, 2)})` : ''}`);
      }
    }
  } else if (b.usdtBalance && b.usdtBalance > 0) {
    const usdtUsd = b.usdtUsd ?? 1;
    lines.push(`> USDT: **${fmt(b.usdtBalance, 6)} USDT** ($${fmt(b.usdtBalance * usdtUsd, 2)})`);
  }

  if (priceUnavailable) {
    lines.push('> *USD price unavailable — check COINGECKO_DEMO_API_KEY in .env*');
  }

  lines.push(`Address:`);
  lines.push(`> \`${b.address}\``);

  const e = responseBuilder.buildResult({ title: `${b.chain} Wallet Balance`, description: lines.join('\n') });

  if (b.explorerAddrUrl) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View Address')
        .setStyle(ButtonStyle.Link)
        .setURL(b.explorerAddrUrl)
        .setEmoji('🔗')
    );
    e.addActionRowComponents(row);
  }
  return opts(e);
}

module.exports = {
  name: 'bal',
  aliases: ['balance', 'b'],
  category: 'crypto',
  description: 'Check wallet balance across Bitcoin, Dogecoin, Litecoin, Solana, Tron, Polygon, BNB Chain, Ethereum, Arbitrum, Base, Optimism.',
  usage: '[network] <address>',
  cooldown: 3,
  args: true,

  async execute(message, args, client) {
    const tokens = (args || []).map((a) => String(a).trim()).filter(Boolean);
    if (!tokens.length) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Usage: \`${config.prefix}bal [network] <address>\`` })));
    }

    let explicitNetwork = null;
    let address = '';

    const net0 = normalizeNetworkName(tokens[0]);
    if (net0 && tokens[1]) {
      explicitNetwork = net0;
      address = tokens[1];
    } else {
      const net1 = tokens[1] ? normalizeNetworkName(tokens[1]) : null;
      if (net1) {
        explicitNetwork = net1;
        address = tokens[0];
      } else {
        address = tokens[0];
      }
    }

    // 1. Explicit Network Provided
    if (explicitNetwork) {
      const netLabel = explicitNetwork.toUpperCase();
      const statusMsg = await message.reply(
        opts(responseBuilder.buildResult({ description: `⏳ Fetching **${netLabel}** balance for \`${shortAddr(address)}\`…` }))
      );

      try {
        let bal = null;
        if (['polygon', 'bnb', 'ethereum', 'arbitrum', 'base', 'optimism'].includes(explicitNetwork)) {
          bal = await evmFetchBalance(explicitNetwork, address);
        } else if (explicitNetwork === 'bitcoin') {
          bal = await bitcoinFetchBalance(address);
        } else if (explicitNetwork === 'dogecoin') {
          bal = await dogecoinFetchBalance(address);
        } else if (explicitNetwork === 'litecoin') {
          bal = await litecoinFetchBalance(address);
        } else if (explicitNetwork === 'tron') {
          bal = await tronFetchBalance(address);
        } else if (explicitNetwork === 'solana') {
          bal = await solanaFetchBalance(address);
        } else {
          throw new Error(`Unsupported network: ${explicitNetwork}`);
        }

        if (bal.nativeCoinId) {
          try { bal.usdPerNative = await getUsdPrice(bal.nativeCoinId); } catch { bal.usdPerNative = null; }
        }

        const embedData = await buildBalanceEmbed(bal);
        return statusMsg.edit(embedData);
      } catch (err) {
        return statusMsg.edit(
          opts(responseBuilder.buildResult({ title: 'Balance Lookup Failed', description: `Failed to fetch balance on **${netLabel}**:\n${err.message}` }))
        );
      }
    }

    // 2. Automatic Detection
    const detected = detectAddressChain(address);

    if (detected.type === 'unknown') {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: 'Invalid Address Format',
          description: 'Unrecognized wallet address format.\n\n' +
            '**Supported Formats:**\n' +
            '• **EVM:** `0x...` (Polygon, BNB, ETH, Arbitrum, Base, Optimism)\n' +
            '• **Bitcoin:** `bc1...` (Bech32), `1...` (Legacy), `3...` (P2SH)\n' +
            '• **Dogecoin:** `D...`, `A...`, `9...`\n' +
            '• **Litecoin:** `L...`, `M...`, `ltc1...`\n' +
            '• **Tron:** `T...` (TRX & TRC-20 tokens)\n' +
            '• **Solana:** Base58 (SOL & SPL tokens)\n\n' +
            `You can also specify the network directly: \`${config.prefix}bal <network> <address>\``,
        }))
      );
    }

    // EVM: Ambiguous across EVM chains -> show dropdown
    if (detected.type === 'evm') {
      const embed = buildAmbiguousEmbed(address, 'EVM Chains');
      const row = buildEvmSelectRow();
      embed.addActionRowComponents(row);
      const sent = await message.reply(opts(embed));
      state.set(sent.id, { address, invokerId: message.author.id, at: Date.now() });
      setTimeout(() => state.delete(sent.id), 5 * 60_000).unref?.();
      return;
    }

    // UTXO P2SH: Ambiguous between Bitcoin and Litecoin -> show dropdown
    if (detected.type === 'utxo_p2sh') {
      const embed = buildAmbiguousEmbed(address, 'Bitcoin / Litecoin');
      const row = buildUtxoSelectRow();
      embed.addActionRowComponents(row);
      const sent = await message.reply(opts(embed));
      state.set(sent.id, { address, invokerId: message.author.id, at: Date.now() });
      setTimeout(() => state.delete(sent.id), 5 * 60_000).unref?.();
      return;
    }

    // Direct lookups for deterministic non-ambiguous formats
    const networkName = detected.type.charAt(0).toUpperCase() + detected.type.slice(1);
    const statusMsg = await message.reply(
      opts(responseBuilder.buildResult({ description: `⏳ Fetching **${networkName}** balance for \`${shortAddr(address)}\`…` }))
    );

    try {
      let bal;
      if (detected.type === 'bitcoin') bal = await bitcoinFetchBalance(address);
      else if (detected.type === 'dogecoin') bal = await dogecoinFetchBalance(address);
      else if (detected.type === 'litecoin') bal = await litecoinFetchBalance(address);
      else if (detected.type === 'tron') bal = await tronFetchBalance(address);
      else if (detected.type === 'solana') bal = await solanaFetchBalance(address);
      else throw new Error('Unsupported address type.');

      if (bal.nativeCoinId) {
        try { bal.usdPerNative = await getUsdPrice(bal.nativeCoinId); } catch { bal.usdPerNative = null; }
      }

      const embedData = await buildBalanceEmbed(bal);
      return statusMsg.edit(embedData);
    } catch (e) {
      return statusMsg.edit(
        opts(responseBuilder.buildResult({ title: 'Balance Lookup Failed', description: `Balance lookup failed: **${e.message}**` }))
      );
    }
  },

  // Called from interactionCreate when user picks network from dropdown
  async handleInteraction(interaction, _client) {
    try {
      if (!interaction.isStringSelectMenu() || interaction.customId !== 'bal_network_select') return;
      const st = state.get(interaction.message.id);
      if (!st) {
        return interaction.update(opts(responseBuilder.buildResult({ description: 'This lookup has expired. Run `?bal <address>` again.' })));
      }

      if (interaction.user.id !== st.invokerId) {
        return interaction.reply(opts(buildContainer({ description: 'Only the user who ran `?bal` can pick the network.', color: '#FEE75C' }), { ephemeral: true }));
      }

      const chainKey = interaction.values[0];
      const allOptions = [...EVM_OPTIONS, ...UTXO_P2SH_OPTIONS];
      const opt = allOptions.find((o) => o.value === chainKey) || { label: chainKey };

      await interaction.update(
        opts(responseBuilder.buildResult({ description: `⏳ Fetching **${opt.label}** balance…` }))
      );

      try {
        let bal;
        if (['polygon', 'bnb', 'ethereum', 'arbitrum', 'base', 'optimism'].includes(chainKey)) {
          bal = await evmFetchBalance(chainKey, st.address);
        } else if (chainKey === 'bitcoin') {
          bal = await bitcoinFetchBalance(st.address);
        } else if (chainKey === 'litecoin') {
          bal = await litecoinFetchBalance(st.address);
        } else if (chainKey === 'dogecoin') {
          bal = await dogecoinFetchBalance(st.address);
        } else if (chainKey === 'tron') {
          bal = await tronFetchBalance(st.address);
        } else if (chainKey === 'solana') {
          bal = await solanaFetchBalance(st.address);
        }

        if (bal.nativeCoinId) {
          try { bal.usdPerNative = await getUsdPrice(bal.nativeCoinId); } catch { bal.usdPerNative = null; }
        }

        const embedData = await buildBalanceEmbed(bal);
        await interaction.message.edit(embedData);
      } catch (e) {
        await interaction.message.edit(
          opts(responseBuilder.buildResult({ title: 'Balance Lookup Failed', description: `${opt.label} balance lookup failed: **${e.message}**` }))
        ).catch(() => {});
      } finally {
        state.delete(interaction.message.id);
      }
    } catch (e) {
      console.error('[bal] handleInteraction exception:', e);
    }
  },
};

module.exports.default = async function (interaction, client) {
  return module.exports.handleInteraction(interaction, client);
};
