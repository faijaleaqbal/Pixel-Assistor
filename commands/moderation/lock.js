// src/commands/moderation/lock.js
// Lock the current channel (deny SendMessages for @everyone).

const responseBuilder = require('../../utils/responseBuilder');
const { sendTempReply } = require('../../utils/tempReply');
const { checkBotPermissions } = require('../../utils/perms');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'lock',
  category: 'moderation',
  aliases: ['lck'],
  description: 'Lock the current channel (deny SendMessages for @everyone).',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    const botCheck = checkBotPermissions(message, ['ManageChannels']);
    if (!botCheck.ok) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ I do not have **ManageChannels** permission in this channel.'})));
    }

    try {
      const everyone = message.guild.roles.everyone;
      await message.channel.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: `Locked by ${message.author.tag}` });
      return sendTempReply(message, opts(responseBuilder.buildResult({ description: '🔒 Channel locked.'})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to lock channel: ${e.message}`})));
    }
  },
};
