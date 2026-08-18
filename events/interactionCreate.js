// src/events/interactionCreate.js
// Handles button, select-menu, and slash command interactions.
// Enforces permissions, ownerOnly, cooldowns, and safe error responses.

const logger = require('../utils/logger');
const cooldowns = require('../utils/cooldowns');
const { hasPermission, isOwner } = require('../utils/perms');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands?.get(interaction.commandName);
        if (!cmd) {
          return interaction.reply({ content: '❌ This command is no longer registered.', ephemeral: true });
        }

        // 1. Owner-only check
        if (cmd.ownerOnly && !isOwner(interaction.user.id)) {
          return interaction.reply({ content: '❌ This command is restricted to the bot owner.', ephemeral: true });
        }

        // 2. Permissions check
        if (cmd.permissions && cmd.permissions.length && interaction.member) {
          const missing = cmd.permissions.filter((p) => !hasPermission(interaction.member, p));
          if (missing.length) {
            return interaction.reply({
              content: `❌ You need these permissions to use this command: \`${missing.join(', ')}\``,
              ephemeral: true,
            });
          }
        }

        // 3. Cooldown check
        const cd = cooldowns.check(cmd.name, interaction.user.id, cmd.cooldown);
        if (cd > 0) {
          return interaction.reply({
            content: `⏳ Please wait **${cd}s** before using this command again.`,
            ephemeral: true,
          });
        }

        if (cmd.slashExecute) {
          await cmd.slashExecute(interaction, client);
        } else {
          await interaction.reply({ content: 'ℹ️ This command is currently available via prefix.', ephemeral: true });
        }
        return;
      }

      if (interaction.isButton()) {
        const id = interaction.customId;

        // Help dropdown / buttons — handled centrally in help.js
        if (id.startsWith('help_')) {
          return require('../commands/utility/help').handleInteraction(interaction, client);
        }

        // Game, ticket, AFK collectors handled by per-message collectors
        if (id.startsWith('ttt_')) return;
        if (id.startsWith('rps_')) return;
        if (id.startsWith('react_')) return;
        if (id.startsWith('ticket_')) return;
        if (id.startsWith('afk_')) return;
        if (id.startsWith('pg_')) return;

        if (id.startsWith('copy_upi_')) {
          const upiId = id.slice('copy_upi_'.length);
          return interaction.reply({ content: `\`${upiId}\``, ephemeral: true });
        }

        // Unknown / expired buttons
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content: 'ℹ️ This button interaction has expired.', ephemeral: true }).catch(() => {});
        }
        return;
      }

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

      if (interaction.isModalSubmit && interaction.isModalSubmit()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }
    } catch (e) {
      logger.error('interactionCreate handler error', e?.stack || e?.message || e);
      try {
        const userMsg = '❌ An unexpected error occurred while processing this interaction.';
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: userMsg }).catch(() => {});
        } else {
          await interaction.reply({ content: userMsg, ephemeral: true }).catch(() => {});
        }
      } catch { /* ignore secondary delivery failure */ }
    }
  },
};
