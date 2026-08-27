// src/commands/moderation/autopurge.js
// Toggle an auto-purge loop on a channel: every N seconds, delete messages older than M seconds.
// Stored in-memory; automatically handles permission loss and channel deletion safely.

const { PermissionsBitField } = require('discord.js');
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getPrefix } = require('../../utils/prefixCache');
const { isTrustedOwner } = require('../../utils/perms');
const logger = require('../../utils/logger');

// channelId -> { id: intervalId, maxAge: number, interval: number, guildId: string, startedAt: number }
const loops = new Map();

const FOURTEEN_DAYS_SEC = 14 * 24 * 60 * 60; // 1,209,600s

function stopLoop(channelId) {
  const entry = loops.get(channelId);
  if (entry) {
    clearInterval(entry.id);
    loops.delete(channelId);
    return true;
  }
  return false;
}

module.exports = {
  name: 'autopurge',
  category: 'moderation',
  aliases: ['apg'],
  description: 'Auto-purge messages older than N seconds every M seconds.',
  usage: '<on <maxAge> [interval]|off|status>',
  cooldown: 5,
  ownerOnly: true,
  permissions: ['ManageMessages', 'ManageGuild'],
  args: false,
  loops,
  stopLoop,

  async execute(message, args, client) {
    const isAuthorized = await isTrustedOwner(message.author.id, message.guild);
    if (!isAuthorized) {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: 'Access Denied',
          description: "❌ You don't have permission to use this command. This command is restricted to Server Owners & Trusted Owners.",
        }))
      );
    }

    const prefix = await getPrefix(message.guild?.id);
    const mode = (args[0] || '').toLowerCase();
    const channelId = message.channelId;

    // ── Status ──
    if (!mode || mode === 'status' || mode === 'check') {
      const active = loops.get(channelId);
      if (!active) {
        return message.reply(opts(responseBuilder.buildResult({
          title: '🔄 Auto-Purge Status',
          description: `Auto-purge is currently **disabled** in this channel.\n\n` +
            `**Usage:**\n` +
            `• \`${prefix}autopurge on <maxAgeSeconds> [intervalSeconds]\` — Enable auto-purge\n` +
            `• \`${prefix}autopurge off\` — Stop auto-purge\n` +
            `• \`${prefix}autopurge status\` — View current status\n\n` +
            `*Example: \`${prefix}autopurge on 300 60\` (delete msgs older than 5m every 60s)*`,
        })));
      }

      const uptimeSec = Math.floor((Date.now() - active.startedAt) / 1000);
      return message.reply(opts(responseBuilder.buildResult({
        title: '🔄 Auto-Purge Active',
        description: `Auto-purge is **active** in <#${channelId}>.\n\n` +
          `• **Max Age:** \`${active.maxAge}s\` (${Math.round(active.maxAge / 60)}m)\n` +
          `• **Interval:** \`${active.interval}s\`\n` +
          `• **Running for:** \`${uptimeSec}s\`\n\n` +
          `Use \`${prefix}autopurge off\` to disable.`,
      })));
    }

    // ── Off ──
    if (mode === 'off' || mode === 'stop' || mode === 'disable') {
      const stopped = stopLoop(channelId);
      if (stopped) {
        return message.reply(opts(responseBuilder.buildResult({
          title: '🛑 Auto-Purge Stopped',
          description: `Auto-purge has been stopped for <#${channelId}>.`,
        })));
      }
      return message.reply(opts(responseBuilder.buildResult({
        description: `Auto-purge was not running in this channel.`,
      })));
    }

    // ── On ──
    if (mode === 'on' || mode === 'start' || mode === 'enable') {
      const maxAgeInput = args[1];
      const intervalInput = args[2];

      const maxAge = parseInt(maxAgeInput, 10);
      const interval = intervalInput ? parseInt(intervalInput, 10) : 60;

      if (!maxAge || isNaN(maxAge) || maxAge < 5) {
        return message.reply(opts(responseBuilder.buildResult({
          title: 'Invalid Max Age',
          description: `\`maxAgeSeconds\` must be a number greater than or equal to **5 seconds**.\nExample: \`${prefix}autopurge on 300 60\``,
        })));
      }

      if (maxAge > FOURTEEN_DAYS_SEC) {
        return message.reply(opts(responseBuilder.buildResult({
          title: 'Age Limit Exceeded',
          description: `\`maxAgeSeconds\` cannot exceed **14 days** (1,209,600 seconds) due to Discord API limitations for message deletion.`,
        })));
      }

      if (isNaN(interval) || interval < 10) {
        return message.reply(opts(responseBuilder.buildResult({
          title: 'Invalid Interval',
          description: `\`intervalSeconds\` must be at least **10 seconds** to protect against Discord API rate limits.`,
        })));
      }

      if (interval > 86400) {
        return message.reply(opts(responseBuilder.buildResult({
          title: 'Invalid Interval',
          description: `\`intervalSeconds\` cannot exceed **24 hours** (86,400 seconds).`,
        })));
      }

      // Check bot channel permissions
      const botMember = message.guild?.members?.me;
      if (botMember && message.channel.permissionsFor) {
        const perms = message.channel.permissionsFor(botMember);
        if (!perms || !perms.has(PermissionsBitField.Flags.ManageMessages) || !perms.has(PermissionsBitField.Flags.ReadMessageHistory)) {
          return message.reply(opts(responseBuilder.buildResult({
            title: 'Missing Bot Permissions',
            description: `I need \`Manage Messages\` and \`Read Message History\` permissions in this channel to run auto-purge.`,
          })));
        }
      }

      // Stop any existing loop on this channel
      stopLoop(channelId);

      const guildId = message.guild?.id;

      // Interval runner — does NOT capture message object to prevent memory leaks
      const id = setInterval(async () => {
        try {
          const ch = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
          if (!ch || !ch.isTextBased()) {
            stopLoop(channelId);
            return;
          }

          const cutoff = Date.now() - (maxAge * 1000);
          const fourteenDaysAgo = Date.now() - (FOURTEEN_DAYS_SEC * 1000);
          const effectiveCutoff = Math.max(cutoff, fourteenDaysAgo);

          const fetched = await ch.messages.fetch({ limit: 50 }).catch((err) => {
            if (err.code === 10003 || err.code === 50001 || err.code === 50013) {
              logger.warn(`Auto-purge stopped for channel ${channelId} due to error ${err.code}: ${err.message}`);
              stopLoop(channelId);
            }
            return null;
          });

          if (!fetched || !fetched.size) return;

          const toDelete = fetched.filter((m) => m.createdTimestamp < effectiveCutoff && !m.pinned);
          if (!toDelete.size) return;

          if (toDelete.size === 1) {
            await toDelete.first().delete().catch(() => {});
          } else {
            await ch.bulkDelete(toDelete, true).catch((err) => {
              if (err.code === 50013 || err.code === 50001) {
                stopLoop(channelId);
              }
            });
          }
        } catch (e) {
          logger.debug(`autopurge tick error in ${channelId}: ${e.message}`);
        }
      }, interval * 1000);

      if (typeof id.unref === 'function') id.unref();

      loops.set(channelId, {
        id,
        maxAge,
        interval,
        guildId,
        startedAt: Date.now(),
      });

      return message.reply(opts(responseBuilder.buildResult({
        title: '✅ Auto-Purge Enabled',
        description: `Auto-purge is now **ON** in <#${channelId}>.\n\n` +
          `• **Deleting messages older than:** \`${maxAge}s\` (${Math.round(maxAge / 60)}m)\n` +
          `• **Check frequency:** Every \`${interval}s\`\n` +
          `• **Stop command:** \`${prefix}autopurge off\``,
      })));
    }

    // Invalid mode fallback
    return message.reply(opts(responseBuilder.buildResult({
      title: 'Invalid Usage',
      description: `Usage: \`${prefix}autopurge on <maxAgeSeconds> [intervalSeconds]\` or \`${prefix}autopurge off\`\n\n` +
        `Example: \`${prefix}autopurge on 300 60\``,
    })));
  },
};
