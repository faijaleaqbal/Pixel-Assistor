// src/commands/moderation/unhide.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'unhide',
  category: 'moderation',
  aliases: ['uh'],
  description: 'Make the current channel visible to @everyone again.',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
    return message.reply(opts(responseBuilder.buildResult({ description: '👁️ Channel visible again.'})));
  },
};
