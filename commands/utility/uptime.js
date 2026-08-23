// src/commands/utility/uptime.js
// Show bot uptime since process start.

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'uptime',
  aliases: ['up'],
  category: 'utility',
  description: 'Show how long the bot has been online',
  usage: '',
  cooldown: 3,
  async execute(message) {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);

    const embed = responseBuilder.buildResult({ title: '⏱️ Bot Uptime', description: `\`\`\`${days}d ${hours}h ${mins}m ${secs}s\`\`\`\nStarted: <t:${Math.floor((Date.now() - uptime * 1000) / 1000)}:R>`});

    return message.reply(opts(embed));
  },
};
