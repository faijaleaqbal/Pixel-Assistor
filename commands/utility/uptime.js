// src/commands/utility/uptime.js
// Show bot uptime since process start.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

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

    const embed = new EmbedBuilder()
      .setColor(config.embedColor || 0x57F287)
      .setTitle('⏱️ Bot Uptime')
      .setDescription(`\`\`\`${days}d ${hours}h ${mins}m ${secs}s\`\`\`\nStarted: <t:${Math.floor((Date.now() - uptime * 1000) / 1000)}:R>`)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
