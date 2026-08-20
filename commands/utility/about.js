const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/about.js
// Bot information with credits, uptime, and runtime stats.

const { version: djsVersion } = require('discord.js');

module.exports = {
  name: 'about',
  category: 'utility',
  description: 'Show bot info and credits',
  usage: '',
  cooldown: 5,
  async execute(message) {
    const client = message.client;
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);
    const mem = process.memoryUsage();
    const servers = client.guilds.cache.size;
    const users = client.users.cache.size;

    const embed = responseBuilder.buildResult({ title: `ℹ️ About ${client.user.username}`, fields: [{ name: 'Creator', value: 'Developer', inline: true },
        { name: 'Library', value: `discord.js v${djsVersion}`, inline: true },
        { name: 'Node.js', value: process.version, inline: true },
        { name: 'Servers', value: String(servers), inline: true },
        { name: 'Users', value: String(users), inline: true },
        { name: 'Uptime', value: `${days}d ${hours}h ${mins}m ${secs}s`, inline: true },
        { name: 'Memory', value: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },], thumbnail: client.user.displayAvatarURL({ size: 512 })});

    return message.reply({ embeds: [embed] });
  },
};
