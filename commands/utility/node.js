// src/commands/utility/node.js
// Show Node.js runtime information.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

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

    const embed = new EmbedBuilder()
      .setColor(config.embedColor || 0x5865F2)
      .setTitle('🟢 Node.js Info')
      .addFields(
        { name: 'Version', value: process.version, inline: true },
        { name: 'Platform', value: `${process.platform} (${process.arch})`, inline: true },
        { name: 'Uptime', value: `${days}d ${hours}h ${mins}m ${secs}s`, inline: true },
        { name: 'RSS', value: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
        { name: 'Heap Used', value: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
        { name: 'Heap Total', value: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`, inline: true },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
