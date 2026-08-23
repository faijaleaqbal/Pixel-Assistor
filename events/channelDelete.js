// src/events/channelDelete.js
// Anti-nuke: detects unauthorized channel deletion and recreates it.

const { AuditLogEvent, ChannelType } = require('discord.js');
const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
const { buildContainer } = require('../utils/v2Reply');
const { fetchAuditEntry, sendLog, punish, isExempt, RED, ORANGE } = require('./antinukeHelpers');

module.exports = {
  name: 'channelDelete',

  async execute(channel, client) {
    try {
      if (channel.partial) {
        // Cannot fetch a channel that's already been deleted — proceed with the
        // partial data we already have (name, type, parentId are all present).
      }
      const guild = channel.guild;
      const cfg = await getDb().antinuke.get(guild.id);
      if (!cfg || !cfg.enabled) return;

      const entry = await fetchAuditEntry(guild, AuditLogEvent.ChannelDelete, channel.id);
      if (!entry || !entry.executor) return;
      const user = entry.executor;

      if (await isExempt(user, guild, cfg, client)) return;

      // Log
      await sendLog(guild, cfg, client, buildContainer({
        emoji: '🛑',
        title: 'Channel Deleted',
        description: `**${user.tag}** deleted channel \`#${channel.name}\``,
        fields: [
          { name: 'Type', value: { [ChannelType.GuildText]: 'Text', [ChannelType.GuildVoice]: 'Voice', [ChannelType.GuildCategory]: 'Category', [ChannelType.GuildAnnouncement]: 'Announcement', [ChannelType.GuildStageVoice]: 'Stage', [ChannelType.GuildForum]: 'Forum' }[channel.type] || String(channel.type) },
          { name: 'Punishment', value: `\`${cfg.punishment}\`` },
        ],
        color: RED,
      }));

      // Undo: recreate channel
      try {
        // Build clean options — only include props that apply to the channel type
        const chOpts = {
          name: channel.name,
          type: channel.type,
          parent: channel.parentId || undefined,
        };

        // Permission overwrites
        if (channel.permissionOverwrites && channel.permissionOverwrites.cache.size) {
          chOpts.permissionOverwrites = channel.permissionOverwrites.cache.map(po => ({
            id: po.id,
            allow: po.allow.toArray(),
            deny: po.deny.toArray(),
            type: po.type,
          }));
        }

        // Text-specific options (don't include topic/nsfw for category/voice channels —
        // Discord 400s on those)
        if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
          if (channel.topic) chOpts.topic = channel.topic;
          if (channel.nsfw) chOpts.nsfw = true;
          if (channel.rateLimitPerUser) chOpts.rateLimitPerUser = channel.rateLimitPerUser;
        }

        // Voice-specific options
        if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
          if (channel.bitrate) chOpts.bitrate = channel.bitrate;
          if (typeof channel.userLimit === 'number' && channel.userLimit > 0) chOpts.userLimit = channel.userLimit;
        }

        const newCh = await guild.channels.create(chOpts);

        if (newCh) {
          await sendLog(guild, cfg, client, buildContainer({
            emoji: '🔄',
            title: 'Channel Recreated',
            description: `Recreated as <#${newCh.id}>`,
            color: ORANGE,
          }));
        }
      } catch (createErr) {
        logger.warn(`channelDelete anti-nuke: failed to recreate #${channel.name}`, createErr.message);
        await sendLog(guild, cfg, client, buildContainer({
          emoji: '⚠️',
          title: 'Channel Recreate Failed',
          description: `Could not recreate \`#${channel.name}\`: **${createErr.message}**`,
          color: RED,
        }));
      }

      await punish(guild, cfg, user);
    } catch (e) {
      logger.warn('channelDelete anti-nuke error', e.message);
    }
  },
};
