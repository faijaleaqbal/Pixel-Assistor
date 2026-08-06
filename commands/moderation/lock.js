// src/commands/moderation/lock.js

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { sendTempReply } = require('../../utils/tempReply');

module.exports = {
  name: 'lock',
  category: 'moderation',
  aliases: ['lck'],
  description: 'Lock the current channel (deny SendMessages for @everyone).',
  usage: '',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    const everyone = message.guild.roles.everyone;
    await message.channel.permissionOverwrites.edit(everyone, { SendMessages: false });
    return sendTempReply(message, { embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('🔒 Channel locked.')] });
  },
};
