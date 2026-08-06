// src/commands/moderation/unlock.js

const { EmbedBuilder } = require('discord.js');
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
    return sendTempReply(message, { embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('🔓 Channel unlocked.')] });
  },
};
