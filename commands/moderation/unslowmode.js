// src/commands/moderation/unslowmode.js

const responseBuilder = require('../../utils/responseBuilder');

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
    return message.reply({ embeds: [responseBuilder.buildResult({ description: '🐇 Slowmode disabled.'})] });
  },
};
