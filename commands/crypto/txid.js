const responseBuilder = require('../../utils/responseBuilder');
// src/commands/crypto/txid.js
// Multi-chain crypto transaction lookup command (?txid / ?tx).
// Supports Polygon, Ethereum, BNB Chain, Arbitrum, Base, Optimism, Litecoin, Solana, Tron.
//
// Usage:
//   ?tx <hash>
//   ?tx <network> <hash>
//   ?tx <network> <hash> <walletAddress>
//   ?tx <hash> <network>

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../../utils/config');
const { opts, buildContainer } = require('../../utils/v2Reply');
const {
  parseTransaction,
  parseTxCommandInput,
  detectTxFormat,
  buildTransactionEmbed,
} = require('../../utils/crypto');

const PURPLE = 0x5865F2;
const YELLOW = 0xFEE75C;
const RED = 0xED4245;

// In-memory state for network picker dropdown: messageId -> { hash, walletAddress, invokerId, at }
const state = new Map();

const EVM_SELECT_OPTIONS = [
  { value: 'polygon',  label: 'Polygon',       emoji: '🟣', description: 'Polygon PoS (POL / MATIC)' },
  { value: 'ethereum', label: 'Ethereum',     emoji: '🔷', description: 'Ethereum Mainnet (ETH)' },
  { value: 'bnb',      label: 'BNB Chain',     emoji: '🟡', description: 'BNB Smart Chain (BNB)' },
  { value: 'arbitrum', label: 'Arbitrum One',  emoji: '🔵', description: 'Arbitrum Layer 2 (ETH)' },
  { value: 'base',     label: 'Base',          emoji: '🟦', description: 'Base Layer 2 (ETH)' },
  { value: 'optimism', label: 'Optimism',      emoji: '🔴', description: 'Optimism Mainnet (ETH)' },
];

const HEX64_SELECT_OPTIONS = [
  { value: 'litecoin', label: 'Litecoin', emoji: '🪙', description: 'Litecoin Mainnet (LTC)' },
  { value: 'tron',     label: 'Tron',     emoji: '🔴', description: 'Tron Network (TRX / TRC-20)' },
];

function footerNow() {
  return { text: `Developed by Pixel Assistant • ${new Date().toUTCString()}` };
}

function buildEvmSelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('txid_network_select')
      .setPlaceholder('Select EVM Network...')
      .addOptions(
        EVM_SELECT_OPTIONS.map((o) => ({
          label: o.label,
          value: o.value,
          emoji: o.emoji,
          description: o.description,
        }))
      )
  );
}

function buildHex64SelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('txid_network_select')
      .setPlaceholder('Select Network (Litecoin / Tron)...')
      .addOptions(
        HEX64_SELECT_OPTIONS.map((o) => ({
          label: o.label,
          value: o.value,
          emoji: o.emoji,
          description: o.description,
        }))
      )
  );
}

function buildAmbiguousEmbed(hash, type = 'EVM') {
  return responseBuilder.buildResult({ title: 'Select Network', description: `This hash format is shared across multiple networks (${type}).\n` +
      `Please pick the target network below to look up this transaction:\n\n` +
      `\`\`\`${hash}\`\`\``});
}

module.exports = {
  name: 'txid',
  aliases: ['tx', 'transaction'],
  category: 'crypto',
  description: 'Look up a cryptocurrency transaction across Polygon, Ethereum, BNB, Arbitrum, Base, Optimism, LTC, SOL, Tron.',
  usage: '[network] <hash> [walletAddress]',
  cooldown: 3,
  args: true,

  async execute(message, args, client) {
    const { explicitNetwork, txIdentifier, walletAddress } = parseTxCommandInput(args);

    if (!txIdentifier) {
      return message.reply(
        opts(responseBuilder.buildResult({ title: 'Missing Transaction Identifier', description: `Usage: \`${config.prefix}tx [network] <hash> [walletAddress]\`\n\n` +
            `Examples:\n` +
            `• \`${config.prefix}tx polygon 0x1234...\`\n` +
            `• \`${config.prefix}tx ltc 8d5aac33...\`\n` +
            `• \`${config.prefix}tx solana 5UfgP...\`\n` +
            `• \`${config.prefix}tx tron 3a7cab14...\``}))
      );
    }

    // 1. Explicit network supplied
    if (explicitNetwork) {
      const netLabel = explicitNetwork.toUpperCase();
      const statusMsg = await message.reply(
        opts(responseBuilder.buildResult({ description: `⏳ Querying **${netLabel}** for transaction \`${txIdentifier.slice(0, 16)}…\`…`}))
      );

      try {
        const tx = await parseTransaction(explicitNetwork, txIdentifier, { walletAddress });
        if (!tx) {
          return statusMsg.edit(
            opts(responseBuilder.buildResult({ title: 'Transaction Not Found', description: `Transaction not found on **${netLabel}** for hash:\n\`\`\`${txIdentifier}\`\`\``}))
          );
        }

        const embedData = buildTransactionEmbed(tx);
        return statusMsg.edit(opts(embedData.container));
      } catch (err) {
        console.error(`[txid] ${explicitNetwork} lookup error:`, err);
        return statusMsg.edit(
          opts(responseBuilder.buildResult({ title: 'Lookup Failed', description: `Unable to parse this transaction on **${netLabel}**:\n${err.message}`}))
        );
      }
    }

    // 2. No explicit network — format-based detection
    const detected = detectTxFormat(txIdentifier);

    if (detected.type === 'unknown') {
      return message.reply(
        opts(responseBuilder.buildResult({ title: 'Invalid Transaction Format', description: `Unrecognized transaction hash/signature format.\n\n` +
            `Supported formats:\n` +
            `• **EVM Chains:** \`0x...\` (66 hex characters)\n` +
            `• **Solana:** Base58 signature (~87-89 characters)\n` +
            `• **Litecoin / Tron:** 64 hexadecimal characters\n\n` +
            `You can specify the network directly: \`${config.prefix}tx <network> <hash>\``}))
      );
    }

    // EVM: Ambiguous across chains -> show dropdown
    if (detected.type === 'evm') {
      const embed = buildAmbiguousEmbed(txIdentifier, 'EVM Chains');
      const row = buildEvmSelectRow();
      embed.addActionRowComponents(row);
      const sent = await message.reply(opts(embed));
      state.set(sent.id, {
        hash: txIdentifier,
        walletAddress,
        invokerId: message.author.id,
        at: Date.now(),
      });
      setTimeout(() => state.delete(sent.id), 5 * 60_000).unref?.();
      return;
    }

    // Solana: Direct lookup
    if (detected.type === 'solana') {
      const statusMsg = await message.reply(
        opts(responseBuilder.buildResult({ description: `⏳ Querying **Solana** for signature \`${txIdentifier.slice(0, 16)}…\`…`}))
      );

      try {
        const tx = await parseTransaction('solana', txIdentifier, { walletAddress });
        if (!tx) {
          return statusMsg.edit(
            opts(responseBuilder.buildResult({ title: 'Transaction Not Found', description: `Transaction not found on **Solana** for signature:\n\`\`\`${txIdentifier}\`\`\``}))
          );
        }

        const embedData = buildTransactionEmbed(tx);
        return statusMsg.edit(opts(embedData.container));
      } catch (err) {
        console.error(`[txid] Solana lookup error:`, err);
        return statusMsg.edit(
          opts(responseBuilder.buildResult({ title: 'Solana Lookup Failed', description: `Unable to parse this transaction on **Solana**:\n${err.message}`}))
        );
      }
    }

    // 64-char hex: Ambiguous between Litecoin and Tron -> Interactive selector
    if (detected.type === 'hex64') {
      const embed = buildAmbiguousEmbed(txIdentifier, 'Litecoin / Tron');
      const row = buildHex64SelectRow();
      embed.addActionRowComponents(row);
      const sent = await message.reply(opts(embed));
      state.set(sent.id, {
        hash: txIdentifier,
        walletAddress,
        invokerId: message.author.id,
        at: Date.now(),
      });
      setTimeout(() => state.delete(sent.id), 5 * 60_000).unref?.();
      return;
    }
  },

  // Dropdown handler for network selection
  async handleInteraction(interaction, _client) {
    try {
      if (!interaction.isStringSelectMenu() || interaction.customId !== 'txid_network_select') return;

      const st = state.get(interaction.message.id);
      if (!st) {
        return interaction.update(
          opts(responseBuilder.buildResult({ description: 'This lookup has expired. Please run `?tx <hash>` again.'}))
        );
      }

      if (interaction.user.id !== st.invokerId) {
        return interaction.reply(
          opts(buildContainer({ description: 'Only the user who requested this transaction lookup can choose the network.', color: '#FEE75C' }), { ephemeral: true })
        );
      }

      const chainKey = interaction.values[0];
      const allOptions = [...EVM_SELECT_OPTIONS, ...HEX64_SELECT_OPTIONS];
      const opt = allOptions.find((o) => o.value === chainKey) || { label: chainKey };

      await interaction.update(
        opts(responseBuilder.buildResult({ description: `⏳ Querying **${opt.label}** for \`${st.hash.slice(0, 16)}…\`…`}))
      );

      try {
        const tx = await parseTransaction(chainKey, st.hash, { walletAddress: st.walletAddress });
        if (!tx) {
          return interaction.message.edit(
            opts(responseBuilder.buildResult({ title: 'Transaction Not Found', description: `No transaction found on **${opt.label}** for hash:\n\`\`\`${st.hash}\`\`\``}))
          );
        }

        const embedData = buildTransactionEmbed(tx);
        await interaction.message.edit(opts(embedData.container));
      } catch (err) {
        console.error(`[txid] ${opt.label} error:`, err);
        await interaction.message.edit(
          opts(responseBuilder.buildResult({ title: 'Lookup Failed', description: `Unable to parse transaction on **${opt.label}**:\n${err.message}`}))
        );
      } finally {
        state.delete(interaction.message.id);
      }
    } catch (e) {
      console.error('[txid] handleInteraction exception:', e);
    }
  },
};
