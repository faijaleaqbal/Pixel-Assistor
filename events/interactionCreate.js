// src/events/interactionCreate.js
// Handles button + select-menu + slash interactions.
// Important: the help command's dropdown is collected HERE (not via a per-message
// collector) so it stays live and reusable indefinitely — see HELP MENU FIX note.

const logger = require('../utils/logger');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands?.get(interaction.commandName);
        if (cmd && cmd.slashExecute) {
          await cmd.slashExecute(interaction, client);
        } else {
          await interaction.reply({ content: 'This slash command has no slashExecute handler yet.', ephemeral: true });
        }
        return;
      }

      if (interaction.isButton()) {
        // Dispatch by customId prefix.
        const id = interaction.customId;

        // Help dropdown / buttons — handled centrally here for the long-lived menu.
        if (id.startsWith('help_')) {
          return require('../commands/utility/help').handleInteraction(interaction, client);
        }

        // Game + ticket + AFK buttons are handled by per-message collectors
        // inside their command files. If we defer/reply here, the local collector
        // would receive an already-acknowledged interaction and its update/reply
        // would throw "Interaction has already been acknowledged." So we
        // deliberately return without touching the interaction.
        if (id.startsWith('ttt_')) return;     // tic-tac-toe — local collector in tictactoe.js
        if (id.startsWith('rps_')) return;     // rock-paper-scissors — local collector in rockpaperscissors.js
        if (id.startsWith('react_')) return;   // reaction game — local collector in reaction.js
        if (id.startsWith('ticket_')) return;  // ticket create/close — local collector in ticket.js
        if (id.startsWith('afk_')) return;     // AFK prompt yes/no — local collector in afk.js
        if (id.startsWith('pg_')) return;      // pagination collectors

        if (id.startsWith('copy_upi_')) {
          const upiId = id.slice('copy_upi_'.length);
          return interaction.reply({ content: `\`${upiId}\``, ephemeral: true });
        }

        // Unknown — defer to avoid stuck buttons
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content: 'This button is no longer active.', ephemeral: true }).catch(() => {});
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

      // Modal-submit interactions are not currently used by any command, but
      // acknowledge them so future modals don't time out silently.
      if (interaction.isModalSubmit && interaction.isModalSubmit()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }
    } catch (e) {
      logger.error('interactionCreate error', e?.stack || e?.message || e);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: 'Interaction error: ' + (e?.message || 'unknown') }).catch(() => {});
        } else {
          await interaction.reply({ content: 'Interaction error: ' + (e?.message || 'unknown'), ephemeral: true }).catch(() => {});
        }
      } catch { /* ignore */ }
    }
  },
};
