// src/commands/admin/setlogchannel.js
const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');
module.exports = {
  name: 'setlogchannel', aliases: ['slc', 'logchannel'], category: 'admin', description: 'Set the server log channel.', usage: '<#channel>', cooldown: 3, permissions: ['ManageChannels'], args: true,
  async execute(message, args, client) {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
    if (!ch) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Mention or provide a channel ID.'})] });
    await getDb().guildConfig.set(message.guild.id, { logChannel: ch.id });
    return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Log channel set to ${ch}.`})] });
  },
};
