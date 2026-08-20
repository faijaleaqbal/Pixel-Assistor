// src/commands/moderation/unlock.js

const responseBuilder = require('../../utils/responseBuilder');
const { sendTempReply } = require('../../utils/tempReply');

module.exports = {
  name: 'unlock',
  category: 'moderation',
  aliases: ['ulk'],
  description: 'Unlock the current channel.',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    const everyone = message.guild.roles.everyone;
    await message.channel.permissionOverwrites.edit(everyone, { SendMessages: null });
    return sendTempReply(message, { embeds: [responseBuilder.buildResult({ description: '🔓 Channel unlocked.'})] });
  },
};
