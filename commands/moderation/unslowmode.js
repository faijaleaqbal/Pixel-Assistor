// src/commands/moderation/unslowmode.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'unslowmode',
  category: 'moderation',
  aliases: ['uslm'],
  description: 'Disable slowmode in the current channel.',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    await message.channel.setRateLimitPerUser(0);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('🐇 Slowmode disabled.')] });
  },
};
