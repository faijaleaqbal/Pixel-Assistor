// src/commands/moderation/export.js
// ?export — Generate an HTML transcript of this channel and DM it to the command author.
//
// Usage:
//   ?export           — Export up to 100 messages.
//   ?export <count>   — Export a custom number of messages (max 1000).
//
// Permissions: ManageMessages (staff-only).

const { EmbedBuilder } = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const { sendTempReply } = require('../../utils/tempReply');

module.exports = {
  name: 'export',
  category: 'moderation',
  aliases: ['exp'],
  description: "Export this channel's transcript and DM it to you.",
  usage: '[count]',
  cooldown: 5,
  permissions: ['ManageMessages'],
  async execute(message, args) {
    // ── 1. Parse optional message count ──
    let count = 100;
    const raw = (args[0] || '').trim();
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      if (n > 0) count = n;
    }
    count = Math.min(Math.max(count, 1), 1000);

    // ── 2. Fetch channel messages ──
    let messages;
    try {
      messages = await message.channel.messages.fetch({ limit: count });
    } catch (e) {
      return sendTempReply(message, {
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          `Failed to fetch messages: ${e.message}`
        )],
      });
    }

    if (!messages || !messages.size) {
      return sendTempReply(message, {
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(
          'No messages found in this channel.'
        )],
      });
    }

    const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // ── 3. Generate HTML transcript ──
    let html;
    try {
      html = await discordTranscripts.generateFromMessages(sorted, message.channel, {
        returnType: 'buffer',
        saveImages: true,
      });
    } catch (e) {
      return sendTempReply(message, {
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          `Failed to generate transcript: ${e.message}`
        )],
      });
    }

    // ── 4. DM the file to the command author ──
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📄 Channel Transcript')
        .addFields(
          { name: 'Server', value: message.guild.name, inline: true },
          { name: 'Channel', value: `#${message.channel.name || message.channelId}`, inline: true },
          { name: 'Messages', value: `${sorted.size}`, inline: true },
        )
        .setTimestamp();

      await message.author.send({
        embeds: [dmEmbed],
        files: [{
          attachment: html,
          name: `${message.channel.name || 'transcript'}-${Date.now()}.html`,
        }],
      });

      // Success — auto-deleting confirmation in channel
      return sendTempReply(message, {
        embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(
          '✅ Transcript sent to your DMs.'
        )],
      });
    } catch {
      // DMs likely closed
      return sendTempReply(message, {
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          "❌ Couldn't DM you the transcript — please enable DMs from server members and try again."
        )],
      });
    }
  },
};
