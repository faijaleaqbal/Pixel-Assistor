// src/commands/moderation/slowmode.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

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
    if (Number.isNaN(v) || v < 0 || v > 21600) return message.reply(opts(buildContainer({ description: 'Value must be 0-21600 seconds.' })));
    try {
      await message.channel.setRateLimitPerUser(v);
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to set slowmode: **${e.message}**`})));
    }
    return message.reply(opts(responseBuilder.buildResult({ description: `🐢 Slowmode set to ${v}s.`})));
  },
};
