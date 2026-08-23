// src/commands/utility/node.js
// Show Node.js runtime information.

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'node',
  category: 'utility',
  description: 'Show Node.js runtime information',
  usage: '',
  cooldown: 5,
  async execute(message) {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);

    const embed = responseBuilder.buildResult({ title: '🟢 Node.js Info', fields: [{ name: 'Version', value: process.version, inline: true },
        { name: 'Platform', value: `${process.platform} (${process.arch})`, inline: true },
        { name: 'Uptime', value: `${days}d ${hours}h ${mins}m ${secs}s`, inline: true },
        { name: 'RSS', value: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
        { name: 'Heap Used', value: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
        { name: 'Heap Total', value: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`, inline: true },]});

    return message.reply(opts(embed));
  },
};
