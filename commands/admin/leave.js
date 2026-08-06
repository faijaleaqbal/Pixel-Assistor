// src/commands/admin/leave.js
// Configure leave messages for members who leave the server.
// Usage:
//   ?leave set <#channel>
//   ?leave message <text>   (use {user}, {server} as variables)
//   ?leave preview
//   ?leave disable
//   ?leave

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'leave',
  category: 'admin',
  description: 'Configure leave messages.',
  usage: 'set <#channel> | message <text> | preview | disable',
  cooldown: 3,
  permissions: ['ManageChannels'],

  async execute(message, args) {
    const db = getDb();
    const action = args[0]?.toLowerCase();

    // View current config
    if (!action) {
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.leaveChannel) return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('Leave messages are **not configured**.\n\nUse `?leave set <#channel>` to get started.')] });
      const ch = message.guild.channels.cache.get(gCfg.leaveChannel);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Leave Configuration')
        .addFields(
          { name: 'Channel', value: ch ? ch.toString() : '`' + gCfg.leaveChannel + '` (not found)', inline: true },
          { name: 'Message', value: gCfg.leaveMsg ? '`' + gCfg.leaveMsg.slice(0, 200) + (gCfg.leaveMsg.length > 200 ? '...' : '') + '`' : '`Default`', inline: false }
        )] });
    }

    // Set channel
    if (action === 'set') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a channel or provide its ID.')] });
      if (!ch.isTextBased()) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('The channel must be a text channel.')] });
      await db.guildConfig.set(message.guild.id, { leaveChannel: ch.id });
      const gCfg = await db.guildConfig.get(message.guild.id);
      const msg = gCfg.leaveMsg || 'Goodbye, {user}. We will miss you!';
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Leave channel set to ${ch}.\n\n**Current message:**\n` + '`' + msg + '`' + '\n\nUse `?leave message <text>` to customize.')] });
    }

    // Set message
    if (action === 'message' || action === 'msg') {
      const text = args.slice(1).join(' ');
      if (!text) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide the leave message.\n\n**Variables:** `{user}`, `{server}`')] });
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.leaveChannel) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('Set a leave channel first: `?leave set <#channel>`')] });
      await db.guildConfig.set(message.guild.id, { leaveMsg: text });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Leave message set to:\n` + '`' + text + '`')] });
    }

    // Preview
    if (action === 'preview') {
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.leaveMsg) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No custom leave message set.')] });
      const preview = gCfg.leaveMsg
        .replace(/{user}/g, message.author.tag)
        .replace(/{server}/g, message.guild.name);
      const embed = new EmbedBuilder().setColor(0xED4245).setTitle('Goodbye!').setDescription(preview).setThumbnail(message.author.displayAvatarURL({ size: 128 })).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // Disable
    if (action === 'disable' || action === 'off' || action === 'remove') {
      await db.guildConfig.set(message.guild.id, { leaveChannel: null, leaveMsg: null });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Leave messages have been **disabled**.')] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Unknown sub-command. Use `set`, `message`, `preview`, or `disable`.')] });
  },
};
