// src/commands/moderation/unhide.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'unhide',
  category: 'moderation',
  aliases: ['uh'],
  description: 'Make the current channel visible to @everyone again.',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('👁️ Channel visible again.')] });
  },
};
