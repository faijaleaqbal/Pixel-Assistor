// src/commands/moderation/hide.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'hide',
  category: 'moderation',
  aliases: ['hd'],
  description: 'Hide the current channel from @everyone.',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('🙈 Channel hidden from @everyone.')] });
  },
};
