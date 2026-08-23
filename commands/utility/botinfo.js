const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/botinfo.js
// Detailed bot statistics.

const { version: djsVersion } = require('discord.js');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'botinfo',
  category: 'utility',
  description: 'Show detailed bot statistics',
  usage: '',
  aliases: ['bi'],
  cooldown: 5,
  async execute(message) {
    const client = message.client;
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);
    const mem = process.memoryUsage();
    let channels = 0;
    client.guilds.cache.forEach((g) => (channels += g.channels.cache.size));

    const embed = responseBuilder.buildResult({ title: `📊 ${client.user.username} Stats`, fields: [{ name: 'Servers', value: String(client.guilds.cache.size), inline: true },
        { name: 'Channels', value: String(channels), inline: true },
        { name: 'Users', value: String(client.users.cache.size), inline: true },
        { name: 'Ping (WS)', value: `${Math.round(client.ws.ping)}ms`, inline: true },
        { name: 'Uptime', value: `${days}d ${hours}h ${mins}m ${secs}s`, inline: true },
        { name: 'Memory (RSS)', value: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
        { name: 'Commands', value: String(client.commands.size), inline: true },
        { name: 'discord.js', value: `v${djsVersion}`, inline: true },
        { name: 'Node.js', value: process.version, inline: true },], thumbnail: client.user.displayAvatarURL({ size: 512 })});

    return message.reply(opts(embed));
  },
};
