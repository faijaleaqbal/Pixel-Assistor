// src/commands/moderation/lock.js
// Lock the current channel (deny SendMessages for @everyone).

const { EmbedBuilder } = require('discord.js');
const { sendTempReply } = require('../../utils/tempReply');
const { checkBotPermissions } = require('../../utils/perms');

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
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I do not have **ManageChannels** permission in this channel.')] });
    }

    try {
      const everyone = message.guild.roles.everyone;
      await message.channel.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: `Locked by ${message.author.tag}` });
      return sendTempReply(message, { embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('🔒 Channel locked.')] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to lock channel: ${e.message}`)] });
    }
  },
};
