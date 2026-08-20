// src/events/interactionCreate.js
// Production-grade interaction router for slash commands, buttons, select menus, and modals.

const logger = require('../utils/logger');
const { executeSlashCommand } = require('../handlers/commandPipeline');
const { safeReply } = require('../utils/interactionHelper');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction) return;

    try {
      // ── 1. Slash Commands ──
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands?.get(interaction.commandName);
        if (!cmd) {
          return safeReply(interaction, {
            content: '❌ This command is no longer registered.',
            ephemeral: true,
          });
        }
        await executeSlashCommand(cmd, interaction, client);
        return;
      }

      // ── 2. Button Interactions ──
      if (interaction.isButton()) {
        const id = interaction.customId;

        // Help navigation
        if (id.startsWith('help_')) {
          return require('../commands/utility/help').handleInteraction(interaction, client);
        }

        // Active component collectors handle these internally
        if (
          id.startsWith('ttt_') ||
          id.startsWith('rps_') ||
          id.startsWith('react_') ||
          id.startsWith('ticket_') ||
          id.startsWith('afk_') ||
          id.startsWith('pg_') ||
          id.startsWith('qr_int_')
        ) {
          return;
        }

        // Copy UPI ID button
        if (id.startsWith('copy_upi_')) {
          const upiId = id.slice('copy_upi_'.length);
          return safeReply(interaction, { content: `\`${upiId}\``, ephemeral: true });
        }

        // Expired/unhandled button
        if (!interaction.deferred && !interaction.replied) {
          await safeReply(interaction, { content: 'ℹ️ This button interaction has expired.', ephemeral: true });
        }
        return;
      }

      // ── 3. Select Menus ──
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'help_category_select') {
          return require('../commands/utility/help').handleInteraction(interaction, client);
        }
        if (interaction.customId === 'txid_network_select') {
          return require('../commands/crypto/txid').handleInteraction(interaction, client);
        }
        if (interaction.customId === 'bal_network_select') {
          return require('../commands/crypto/bal').handleInteraction(interaction, client);
        }
        return;
      }

      // ── 4. Modal Submissions ──
      if (interaction.isModalSubmit && interaction.isModalSubmit()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }
    } catch (e) {
      logger.error('interactionCreate router error', e?.stack || e?.message || e);
      try {
        await safeReply(interaction, {
          content: '❌ An unexpected error occurred while processing this interaction.',
          ephemeral: true,
        });
      } catch { /* ignore secondary failure */ }
    }
  },
};
