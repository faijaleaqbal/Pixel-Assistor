// src/commands/moderation/channelremove.js
// Delete a channel. Usage: channelremove [#channel]

const { EmbedBuilder } = require('discord.js');
const { checkBotPermissions } = require('../../utils/perms');

module.exports = {
  name: 'channelremove',
  category: 'moderation',
  aliases: ['crem'],
  description: 'Delete a channel. Usage: channelremove [#channel]',
  usage: '[#channel]',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message) {
    const ch = message.mentions.channels.first() || message.channel;

    const botCheck = checkBotPermissions(message, ['ManageChannels']);
    if (!botCheck.ok) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I do not have **ManageChannels** permission.')] });
    }

    if (message.guild.rulesChannelId === ch.id || message.guild.publicUpdatesChannelId === ch.id || message.guild.systemChannelId === ch.id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Cannot delete server system or rules channel.')] });
    }

    if (!ch.deletable) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I cannot delete this channel.')] });
    }

    try {
      await ch.delete(`Deleted by ${message.author.tag}`);
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to delete channel: ${e.message}`)] }).catch(() => {});
    }
  },
};
