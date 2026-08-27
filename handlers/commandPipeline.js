// src/handlers/commandPipeline.js
// Production-grade command execution pipeline.
// Coordinates permission checks, hierarchy validation, cooldowns, rate limits,
// execution, observability, and standardized error responses across prefix and slash commands.

const responseBuilder = require('../utils/responseBuilder');
const logger = require('../utils/logger');
const cooldowns = require('../utils/cooldowns');
const { hasPermission, isOwner, isTrustedOwner, checkBotPermissions } = require('../utils/perms');
const { AppError } = require('../utils/errors');
const { safeReply } = require('../utils/interactionHelper');
const { opts } = require('../utils/v2Reply');

/**
 * Executes a prefix command through the verified pipeline.
 */
async function executePrefixCommand(cmd, message, args, client, prefix) {
  const start = Date.now();
  const userId = message.author.id;
  const guildId = message.guild?.id || 'DM';

  try {
    // 1. Owner-only check
    if (cmd.ownerOnly) {
      const isAuthorized = await isTrustedOwner(userId, message.guild);
      if (!isAuthorized) {
        return replyError(message, "You don't have permission to use this command. This is an owner-only command.", 'Access Denied', '🔒', client);
      }
    }

    // 2. Member permissions check
    if (cmd.permissions && cmd.permissions.length && message.member) {
      const missing = cmd.permissions.filter((p) => !hasPermission(message.member, p));
      if (missing.length) {
        const embed = responseBuilder.buildPermissionDenied({ required: missing.join(', '), client });
        return message.reply(opts(embed, { allowedMentions: { parse: [] } })).catch(() => {});
      }
    }

    // 3. Bot permissions check
    if (cmd.permissions && cmd.permissions.length && message.guild) {
      const botCheck = checkBotPermissions(message, cmd.permissions);
      if (!botCheck.ok) {
        const embed = responseBuilder.buildPermissionDenied({
          title: 'Bot Missing Permissions',
          required: botCheck.missing.join(', '),
          client,
        });
        return message.reply(opts(embed, { allowedMentions: { parse: [] } })).catch(() => {});
      }
    }

    // 4. Cooldown check
    const cd = cooldowns.check(cmd.name, userId, cmd.cooldown);
    if (cd > 0) {
      const embed = responseBuilder.buildWarning({
        title: 'Cooldown',
        emoji: '⏳',
        fields: [{ name: 'Slow down', value: `Please wait **${cd}s** before using this command again.` }],
        client,
      });
      return message.reply(opts(embed, { allowedMentions: { parse: [] } })).catch(() => {});
    }

    // 5. Required arguments check
    if (cmd.args && !args.length) {
      const usageStr = cmd.usage ? ` ${cmd.usage}` : '';
      const embed = responseBuilder.buildError({
        title: 'Invalid Usage',
        error: 'Missing required arguments.',
        usage: `${prefix}${cmd.name}${usageStr}`,
        client,
      });
      return message.reply(opts(embed, { allowedMentions: { parse: [] } })).catch(() => {});
    }

    // 6. Execute command
    await cmd.execute(message, args, client);

    const duration = Date.now() - start;
    logger.debug(`[cmd:${cmd.name}] executed in ${duration}ms (guild=${guildId}, user=${userId})`);
  } catch (err) {
    const duration = Date.now() - start;
    logger.error(`[cmd:${cmd.name}] failed after ${duration}ms (guild=${guildId}, user=${userId})`, err);

    if (err instanceof AppError) {
      return replyError(message, err.userMessage, err.name || 'Command Failed', '❌', client);
    }

    return replyError(
      message,
      `An unexpected error occurred while executing \`${cmd.name}\`. Our team has been notified.`,
      'Command Error',
      '❌',
      client
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
    if (cmd.ownerOnly) {
      const isAuthorized = await isTrustedOwner(userId, interaction.guild);
      if (!isAuthorized) {
        const embed = responseBuilder.buildError({
          title: 'Access Denied',
          emoji: '🔒',
          error: "You don't have permission to use this command. This is an owner-only command.",
          client,
        });
        return safeReply(interaction, opts(embed, { ephemeral: true }));
      }
    }

    // 2. Member permissions check
    if (cmd.permissions && cmd.permissions.length && interaction.member) {
      const missing = cmd.permissions.filter((p) => !hasPermission(interaction.member, p));
      if (missing.length) {
        const embed = responseBuilder.buildPermissionDenied({ required: missing.join(', '), client });
        return safeReply(interaction, opts(embed, { ephemeral: true }));
      }
    }

    // 3. Bot permissions check
    if (cmd.permissions && cmd.permissions.length && interaction.guild) {
      const botCheck = checkBotPermissions(interaction, cmd.permissions);
      if (!botCheck.ok) {
        const embed = responseBuilder.buildPermissionDenied({
          title: 'Bot Missing Permissions',
          required: botCheck.missing.join(', '),
          client,
        });
        return safeReply(interaction, opts(embed, { ephemeral: true }));
      }
    }

    // 4. Cooldown check
    const cd = cooldowns.check(cmd.name, userId, cmd.cooldown);
    if (cd > 0) {
      const embed = responseBuilder.buildWarning({
        title: 'Cooldown',
        emoji: '⏳',
        fields: [{ name: 'Slow down', value: `Please wait **${cd}s** before using this command again.` }],
        client,
      });
      return safeReply(interaction, opts(embed, { ephemeral: true }));
    }

    // 5. Execute slash handler
    if (typeof cmd.slashExecute === 'function') {
      await cmd.slashExecute(interaction, client);
    } else {
      const embed = responseBuilder.buildInfo({
        title: 'Prefix Only',
        description: `\`${cmd.name}\` is currently available via message prefix.`,
        client,
      });
      await safeReply(interaction, opts(embed, { ephemeral: true }));
    }

    const duration = Date.now() - start;
    logger.debug(`[slash:${cmd.name}] executed in ${duration}ms (guild=${guildId}, user=${userId})`);
  } catch (err) {
    const duration = Date.now() - start;
    logger.error(`[slash:${cmd.name}] failed after ${duration}ms (guild=${guildId}, user=${userId})`, err);

    const userMsg = err instanceof AppError
      ? err.userMessage
      : 'An unexpected error occurred while executing this slash command.';

    const errEmbed = responseBuilder.buildError({
      title: 'Command Error',
      error: userMsg,
      client,
    });

    return safeReply(interaction, opts(errEmbed, { ephemeral: true }));
  }
}

async function replyError(message, text, title = 'Command Failed', emoji = '❌', client) {
  const embed = responseBuilder.buildError({ title, emoji, error: text, client });
  try {
    await message.reply(opts(embed, { allowedMentions: { parse: [] } }));
  } catch {
    // Message channel permissions might block reply
  }
}

module.exports = {
  executePrefixCommand,
  executeSlashCommand,
  replyError,
};
