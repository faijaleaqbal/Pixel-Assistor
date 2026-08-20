// src/commands/moderation/slowmode.js

const responseBuilder = require('../../utils/responseBuilder');

module.exports = {
  name: 'slowmode',
  category: 'moderation',
  aliases: ['slm'],
  description: 'Set slowmode (seconds). Usage: slowmode <seconds|off>',
  usage: '<seconds|off>',
  cooldown: 3,
  permissions: ['ManageChannels'],
  args: true,
  async execute(message, args, client) {
    const v = args[0].toLowerCase() === 'off' ? 0 : parseInt(args[0], 10);
    if (Number.isNaN(v) || v < 0 || v > 21600) return message.reply('Value must be 0-21600 seconds.');
    try {
      await message.channel.setRateLimitPerUser(v);
    } catch (e) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `Failed to set slowmode: **${e.message}**`})] });
    }
    return message.reply({ embeds: [responseBuilder.buildResult({ description: `🐢 Slowmode set to ${v}s.`})] });
  },
};
