// src/commands/moderation/hide.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'hide',
  category: 'moderation',
  aliases: ['hd'],
  description: 'Hide the current channel from @everyone.',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
    return message.reply(opts(responseBuilder.buildResult({ description: '🙈 Channel hidden from @everyone.'})));
  },
};
