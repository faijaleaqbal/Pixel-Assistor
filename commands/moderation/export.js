// src/commands/moderation/export.js
// ?export — Generate an HTML transcript of this channel and DM it to the command author.
//
// Usage:
//   ?export           — Export up to 100 messages.
//   ?export <count>   — Export a custom number of messages (max 1000).
//
// Permissions: ManageMessages (staff-only).

const { AttachmentBuilder } = require('discord.js');
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const discordTranscripts = require('discord-html-transcripts');
const { getPrefix } = require('../../utils/prefixCache');
const logger = require('../../utils/logger');

module.exports = {
  name: 'export',
  category: 'moderation',
  aliases: ['exp', 'transcript'],
  description: "Export this channel's transcript and DM it to you.",
  usage: '[count]',
  cooldown: 5,
  permissions: ['ManageMessages'],
  async execute(message, args, client) {
    const prefix = await getPrefix(message.guild?.id);

    // ── 1. Parse optional message count ──
    let count = 100;
    const raw = (args[0] || '').trim();
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      if (n > 0) count = n;
    }
    count = Math.min(Math.max(count, 1), 1000);

    // Initial status feedback in channel
    const statusMsg = await message.reply(
      opts(responseBuilder.buildResult({ description: `⏳ Generating transcript for the last **${count}** messages…` }))
    ).catch(() => null);

    const safeChannelName = (message.channel.name || message.channelId || 'transcript').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `transcript-${safeChannelName}-${Date.now()}.html`;

    // ── 2. Generate HTML transcript ──
    let buffer;
    try {
      buffer = await discordTranscripts.createTranscript(message.channel, {
        limit: count,
        returnType: 'buffer',
        filename: fileName,
        saveImages: true,
        poweredBy: false,
      });
    } catch (e) {
      logger.error(`[export] Transcript generation failed for channel ${message.channelId}:`, e);
      const errMsg = opts(responseBuilder.buildResult({
        title: 'Transcript Generation Failed',
        description: `Failed to generate channel transcript: **${e.message}**`,
      }));
      if (statusMsg) return statusMsg.edit(errMsg).catch(() => message.reply(errMsg));
      return message.reply(errMsg);
    }

    if (!buffer || !buffer.length) {
      const emptyMsg = opts(responseBuilder.buildResult({
        description: 'No messages found to export in this channel.',
      }));
      if (statusMsg) return statusMsg.edit(emptyMsg).catch(() => message.reply(emptyMsg));
      return message.reply(emptyMsg);
    }

    // ── 3. Check File Size (8 MB standard Discord limit) ──
    const sizeBytes = buffer.length;
    if (sizeBytes > 8 * 1024 * 1024) {
      const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
      const largeFileMsg = opts(responseBuilder.buildResult({
        title: 'Transcript File Too Large',
        description: `The generated transcript is **${sizeMb} MB**, which exceeds Discord's standard 8 MB upload limit.\n\n` +
          `Try exporting fewer messages (e.g. \`${prefix}export 50\`).`,
      }));
      if (statusMsg) return statusMsg.edit(largeFileMsg).catch(() => message.reply(largeFileMsg));
      return message.reply(largeFileMsg);
    }

    // ── 4. Build Attachment & Send DM to Author ──
    const attachment = new AttachmentBuilder(buffer, {
      name: fileName,
      description: `Transcript of #${message.channel.name || message.channelId} from ${message.guild?.name || 'Discord'}`,
    });

    const targetUser = message.author;
    let dmSent = false;

    try {
      const dmEmbed = responseBuilder.buildResult({
        title: '📄 Channel Transcript Export',
        fields: [
          { name: 'Server', value: message.guild?.name || 'Direct Message', inline: true },
          { name: 'Channel', value: `#${message.channel.name || message.channelId}`, inline: true },
          { name: 'Messages Requested', value: `${count}`, inline: true },
        ],
      });

      await targetUser.send(opts(dmEmbed, {
        files: [attachment],
      }));
      dmSent = true;
    } catch (dmErr) {
      logger.warn(`[export] Failed to DM user ${targetUser.id}:`, dmErr);

      let failDescription = `❌ **Couldn't DM you the transcript.**\n\n`;
      if (dmErr.code === 50007) {
        failDescription += `Your Direct Messages (DMs) appear to be disabled for this server.\n` +
          `Please enable **"Direct Messages from server members"** in your Privacy & Safety settings and try again.`;
      } else if (dmErr.code === 40005) {
        failDescription += `The file is too large for Discord to deliver to your DMs. Try exporting fewer messages.`;
      } else {
        failDescription += `Reason: **${dmErr.message}**`;
      }

      const failMsg = opts(responseBuilder.buildResult({
        title: 'DM Delivery Failed',
        description: failDescription,
      }));

      if (statusMsg) return statusMsg.edit(failMsg).catch(() => message.reply(failMsg));
      return message.reply(failMsg);
    }

    if (dmSent) {
      const successMsg = opts(responseBuilder.buildResult({
        title: '✅ Transcript Exported',
        description: `Successfully exported transcript for **#${message.channel.name || message.channelId}** and sent it to your DMs! 📬`,
      }));

      if (statusMsg) {
        return statusMsg.edit(successMsg).catch(() => message.reply(successMsg));
      }
      return message.reply(successMsg);
    }
  },
};
