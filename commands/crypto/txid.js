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
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../../utils/config');
const {
  parseTransaction,
  getEvmParser,
  parseTxCommandInput,
  detectTxFormat,
  normalizeNetworkName,
  buildTransactionEmbed,
  EVM_CHAINS,
} = require('../../utils/crypto');

const PURPLE = 0x5865F2;
const YELLOW = 0xFEE75C;
const RED = 0xED4245;

// In-memory state for EVM chain picker dropdown: messageId -> { hash, walletAddress, invokerId, at }
const state = new Map();

const EVM_SELECT_OPTIONS = [
  { value: 'polygon',  label: 'Polygon',       emoji: '🟣', description: 'Polygon PoS (POL / MATIC)' },
  { value: 'ethereum', label: 'Ethereum',     emoji: '🔷', description: 'Ethereum Mainnet (ETH)' },
  { value: 'bnb',      label: 'BNB Chain',     emoji: '🟡', description: 'BNB Smart Chain (BNB)' },
  { value: 'arbitrum', label: 'Arbitrum One',  emoji: '🔵', description: 'Arbitrum Layer 2 (ETH)' },
  { value: 'base',     label: 'Base',          emoji: '🟦', description: 'Base Layer 2 (ETH)' },
  { value: 'optimism', label: 'Optimism',      emoji: '🔴', description: 'Optimism Mainnet (ETH)' },
];

function footerNow() {
  return { text: `Developed by Pixel Exchange • ${new Date().toUTCString()}` };
}

function buildNetworkSelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('txid_network_select')
      .setPlaceholder('Select EVM Network...')
      .addOptions(EVM_SELECT_OPTIONS.map((o) => ({
        label: o.label,
        value: o.value,
        emoji: o.emoji,
        description: o.description,
      })))
  );
}

function buildAmbiguousEmbed(hash) {
  return new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle('Select Network')
    .setDescription(
      `This hash matches multiple EVM blockchains.\n` +
      `Please select the network below to query:\n\n` +
      `\`\`\`${hash}\`\`\``
    )
    .setFooter(footerNow())
    .setTimestamp();
}

module.exports = {
  name: 'txid',
  aliases: ['tx', 'transaction'],
  category: 'crypto',
  description: 'Look up a cryptocurrency transaction across Polygon, Ethereum, BNB, Arbitrum, Base, Optimism, LTC, SOL, Tron.',
  usage: '[network] <hash> [walletAddress]',
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const { explicitNetwork, txIdentifier, walletAddress } = parseTxCommandInput(args);

    if (!txIdentifier) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setTitle('Missing Transaction Identifier')
            .setDescription(
              `Usage: \`${config.prefix}tx [network] <hash> [walletAddress]\`\n\n` +
              `Examples:\n` +
              `• \`${config.prefix}tx polygon 0x1234...\`\n` +
              `• \`${config.prefix}tx ltc 3PDZ25VA...\`\n` +
              `• \`${config.prefix}tx solana 5UfgP...\`\n` +
              `• \`${config.prefix}tx 0x1234...\``
            )
            .setFooter(footerNow()),
        ],
      });
    }

    // 1. Explicit network supplied
    if (explicitNetwork) {
      const netLabel = explicitNetwork.toUpperCase();
      const statusMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(PURPLE)
            .setDescription(`⏳ Querying **${netLabel}** for transaction \`${txIdentifier.slice(0, 16)}…\`…`)
            .setFooter(footerNow()),
        ],
      });

      try {
        const tx = await parseTransaction(explicitNetwork, txIdentifier, { walletAddress });
        if (!tx) {
          return statusMsg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(YELLOW)
                .setTitle('Transaction Not Found')
                .setDescription(`Transaction not found on **${netLabel}** for hash:\n\`\`\`${txIdentifier}\`\`\``)
                .setFooter(footerNow())
                .setTimestamp(),
            ],
          });
        }

        const embedData = buildTransactionEmbed(tx);
        return statusMsg.edit(embedData);
      } catch (err) {
        console.error(`[txid] ${explicitNetwork} lookup error:`, err);
        return statusMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(RED)
              .setTitle('Lookup Failed')
              .setDescription(`Unable to parse this transaction on **${netLabel}**:\n${err.message}`)
              .setFooter(footerNow())
              .setTimestamp(),
          ],
        });
      }
    }

    // 2. No explicit network — format-based detection
    const detected = detectTxFormat(txIdentifier);

    if (detected.type === 'unknown') {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setTitle('Invalid Transaction Format')
            .setDescription(
              `Unrecognized transaction hash/signature format.\n\n` +
              `Supported formats:\n` +
              `• **EVM Chains:** \`0x...\` (66 hex characters)\n` +
              `• **Solana:** Base58 signature (~87-89 characters)\n` +
              `• **Litecoin / Tron:** 64 hexadecimal characters\n\n` +
              `You can also explicitly specify the network: \`${config.prefix}tx <network> <hash>\``
            )
            .setFooter(footerNow())
            .setTimestamp(),
        ],
      });
    }

    // EVM: Ambiguous across chains -> show dropdown
    if (detected.type === 'evm') {
      const embed = buildAmbiguousEmbed(txIdentifier);
      const row = buildNetworkSelectRow();
      const sent = await message.reply({ embeds: [embed], components: [row] });
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
      const statusMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(PURPLE)
            .setDescription(`⏳ Querying **Solana** for signature \`${txIdentifier.slice(0, 16)}…\`…`)
            .setFooter(footerNow()),
        ],
      });

      try {
        const tx = await parseTransaction('solana', txIdentifier, { walletAddress });
        if (!tx) {
          return statusMsg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(YELLOW)
                .setTitle('Transaction Not Found')
                .setDescription(`Transaction not found on **Solana** for signature:\n\`\`\`${txIdentifier}\`\`\``)
                .setFooter(footerNow())
                .setTimestamp(),
            ],
          });
        }

        const embedData = buildTransactionEmbed(tx);
        return statusMsg.edit(embedData);
      } catch (err) {
        console.error(`[txid] Solana lookup error:`, err);
        return statusMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(RED)
              .setTitle('Solana Lookup Failed')
              .setDescription(`Unable to parse this transaction on **Solana**:\n${err.message}`)
              .setFooter(footerNow())
              .setTimestamp(),
          ],
        });
      }
    }

    // 64-char hex: Try Tron first if configured, then Litecoin
    if (detected.type === 'hex64') {
      const statusMsg = await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(PURPLE)
            .setDescription(`⏳ Querying blockchain (Litecoin / Tron) for hash \`${txIdentifier.slice(0, 16)}…\`…`)
            .setFooter(footerNow()),
        ],
      });

      try {
        let tx = null;
        if (config.trongridApiKey) {
          try {
            tx = await parseTransaction('tron', txIdentifier, { walletAddress });
          } catch {}
        }
        if (!tx) {
          tx = await parseTransaction('litecoin', txIdentifier, { walletAddress });
        }

        if (!tx) {
          return statusMsg.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(YELLOW)
                .setTitle('Transaction Not Found')
                .setDescription(`No transaction found on Litecoin or Tron for hash:\n\`\`\`${txIdentifier}\`\`\``)
                .setFooter(footerNow())
                .setTimestamp(),
            ],
          });
        }

        const embedData = buildTransactionEmbed(tx);
        return statusMsg.edit(embedData);
      } catch (err) {
        console.error(`[txid] 64-hex lookup error:`, err);
        return statusMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(RED)
              .setTitle('Lookup Failed')
              .setDescription(`Unable to parse transaction:\n${err.message}`)
              .setFooter(footerNow())
              .setTimestamp(),
          ],
        });
      }
    }
  },

  // Dropdown handler for EVM network selection
  async handleInteraction(interaction, client) {
    try {
      if (!interaction.isStringSelectMenu() || interaction.customId !== 'txid_network_select') return;

      const st = state.get(interaction.message.id);
      if (!st) {
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(YELLOW)
              .setDescription('This lookup has expired. Please run `?tx <hash>` again.'),
          ],
          components: [],
        });
      }

      if (interaction.user.id !== st.invokerId) {
        return interaction.reply({
          content: 'Only the user who requested this transaction lookup can choose the network.',
          ephemeral: true,
        });
      }

      const chainKey = interaction.values[0];
      const opt = EVM_SELECT_OPTIONS.find((o) => o.value === chainKey) || { label: chainKey };

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(PURPLE)
            .setDescription(`⏳ Querying **${opt.label}** for \`${st.hash.slice(0, 16)}…\`…`)
            .setFooter(footerNow()),
        ],
        components: [],
      });

      try {
        const tx = await parseTransaction(chainKey, st.hash, { walletAddress: st.walletAddress });
        if (!tx) {
          return interaction.message.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(YELLOW)
                .setTitle('Transaction Not Found')
                .setDescription(`No transaction found on **${opt.label}** for hash:\n\`\`\`${st.hash}\`\`\``)
                .setFooter(footerNow())
                .setTimestamp(),
            ],
          });
        }

        const embedData = buildTransactionEmbed(tx);
        await interaction.message.edit(embedData);
      } catch (err) {
        console.error(`[txid] ${opt.label} error:`, err);
        await interaction.message.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(RED)
              .setTitle('Lookup Failed')
              .setDescription(`Unable to parse transaction on **${opt.label}**:\n${err.message}`)
              .setFooter(footerNow())
              .setTimestamp(),
          ],
        });
      } finally {
        state.delete(interaction.message.id);
      }
    } catch (e) {
      console.error('[txid] handleInteraction exception:', e);
    }
  },
};

module.exports.default = async function (interaction, client) {
  return module.exports.handleInteraction(interaction, client);
};
