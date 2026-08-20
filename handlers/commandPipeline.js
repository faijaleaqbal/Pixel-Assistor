// src/handlers/commandPipeline.js
// Production-grade command execution pipeline.
// Coordinates permission checks, hierarchy validation, cooldowns, rate limits,
// execution, observability, and standardized error responses across prefix and slash commands.

const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const cooldowns = require('../utils/cooldowns');
const { hasPermission, isOwner, checkBotPermissions } = require('../utils/perms');
const { AppError } = require('../utils/errors');
const { safeReply } = require('../utils/interactionHelper');

/**
 * Executes a prefix command through the verified pipeline.
 */
async function executePrefixCommand(cmd, message, args, client, prefix) {
  const start = Date.now();
  const userId = message.author.id;
  const guildId = message.guild?.id || 'DM';

  try {
    // 1. Owner-only check
    if (cmd.ownerOnly && !isOwner(userId)) {
      return replyError(message, 'This command is restricted to the bot owner.', 'Access Denied');
    }

    // 2. Member permissions check
    if (cmd.permissions && cmd.permissions.length && message.member) {
      const missing = cmd.permissions.filter((p) => !hasPermission(message.member, p));
      if (missing.length) {
        return replyError(
          message,
          `You need the following permission(s) to use this command: \`${missing.join(', ')}\``,
          'Missing Permissions'
        );
      }
    }

    // 3. Bot permissions check
    if (cmd.permissions && cmd.permissions.length && message.guild) {
      const botCheck = checkBotPermissions(message, cmd.permissions);
      if (!botCheck.ok) {
        return replyError(
          message,
          `I need the following permission(s) in this server/channel to perform this action: \`${botCheck.missing.join(', ')}\``,
          'Bot Missing Permissions'
        );
      }
    }

    // 4. Cooldown check
    const cd = cooldowns.check(cmd.name, userId, cmd.cooldown);
    if (cd > 0) {
      return replyError(message, `Slow down — try again in **${cd}s**.`, 'Cooldown');
    }

    // 5. Required arguments check
    if (cmd.args && !args.length) {
      const usageStr = cmd.usage ? ` ${cmd.usage}` : '';
      return replyError(
        message,
        `Missing required arguments.\n**Usage:** \`${prefix}${cmd.name}${usageStr}\``,
        'Invalid Usage'
      );
    }

    // 6. Execute command
    await cmd.execute(message, args, client);

    const duration = Date.now() - start;
    logger.debug(`[cmd:${cmd.name}] executed in ${duration}ms (guild=${guildId}, user=${userId})`);
  } catch (err) {
    const duration = Date.now() - start;
    logger.error(`[cmd:${cmd.name}] failed after ${duration}ms (guild=${guildId}, user=${userId})`, err);

    if (err instanceof AppError) {
      return replyError(message, err.userMessage, err.name || 'Error');
    }

    return replyError(
      message,
      `An unexpected error occurred while executing \`${cmd.name}\`. Our team has been notified.`,
      'Command Error'
    );
  }
}

/**
 * Executes a slash command through the verified pipeline.
 */
async function executeSlashCommand(cmd, interaction, client) {
  const start = Date.now();
  const userId = interaction.user.id;
  const guildId = interaction.guildId || 'DM';

  try {
    // 1. Owner-only check
    if (cmd.ownerOnly && !isOwner(userId)) {
      return safeReply(interaction, {
        embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Access Denied').setDescription('This command is restricted to the bot owner.')],
        ephemeral: true,
      });
    }

    // 2. Member permissions check
    if (cmd.permissions && cmd.permissions.length && interaction.member) {
      const missing = cmd.permissions.filter((p) => !hasPermission(interaction.member, p));
      if (missing.length) {
        return safeReply(interaction, {
          embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Missing Permissions').setDescription(`You need the following permission(s) to use this command: \`${missing.join(', ')}\``)],
          ephemeral: true,
        });
      }
    }

    // 3. Bot permissions check
    if (cmd.permissions && cmd.permissions.length && interaction.guild) {
      const botCheck = checkBotPermissions(interaction, cmd.permissions);
      if (!botCheck.ok) {
        return safeReply(interaction, {
          embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Bot Missing Permissions').setDescription(`I need the following permission(s) in this server/channel to perform this action: \`${botCheck.missing.join(', ')}\``)],
          ephemeral: true,
        });
      }
    }

    // 4. Cooldown check
    const cd = cooldowns.check(cmd.name, userId, cmd.cooldown);
    if (cd > 0) {
      return safeReply(interaction, {
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Cooldown').setDescription(`⏳ Please wait **${cd}s** before using this command again.`)],
        ephemeral: true,
      });
    }

    // 5. Execute slash handler
    if (typeof cmd.slashExecute === 'function') {
      await cmd.slashExecute(interaction, client);
    } else {
      await safeReply(interaction, {
        embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`ℹ️ \`${cmd.name}\` is currently available via message prefix.`)],
        ephemeral: true,
      });
    }

    const duration = Date.now() - start;
    logger.debug(`[slash:${cmd.name}] executed in ${duration}ms (guild=${guildId}, user=${userId})`);
  } catch (err) {
    const duration = Date.now() - start;
    logger.error(`[slash:${cmd.name}] failed after ${duration}ms (guild=${guildId}, user=${userId})`, err);

    const userMsg = err instanceof AppError
      ? err.userMessage
      : '❌ An unexpected error occurred while executing this slash command.';

    const errEmbed = new EmbedBuilder().setColor(0xED4245).setTitle('Command Error').setDescription(userMsg).setTimestamp();

    return safeReply(interaction, { embeds: [errEmbed], ephemeral: true });
  }
}

async function replyError(message, text, title = 'Error') {
  const embed = new EmbedBuilder().setColor(0xED4245).setTitle(title).setDescription(text).setTimestamp();
  try {
    await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch {
    // Message channel permissions might block reply
  }
}

module.exports = {
  executePrefixCommand,
  executeSlashCommand,
  replyError,
};
