// src/commands/admin/setlogchannel.js
const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
module.exports = {
  name: 'setlogchannel', aliases: ['slc', 'logchannel'], category: 'admin', description: 'Set the server log channel.', usage: '<#channel>', cooldown: 3, permissions: ['ManageChannels'], args: true,
  async execute(message, args) {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
    if (!ch) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention or provide a channel ID.')] });
    await getDb().guildConfig.set(message.guild.id, { logChannel: ch.id });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Log channel set to ${ch}.`)] });
  },
};
