// src/commands/moderation/channelremove.js

const { EmbedBuilder } = require('discord.js');

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
    await ch.delete();
  },
};
