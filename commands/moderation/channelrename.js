// src/commands/moderation/channelrename.js

const responseBuilder = require('../../utils/responseBuilder');

module.exports = {
  name: 'channelrename',
  category: 'moderation',
  aliases: ['cren'],
  description: 'Rename a channel. Usage: channelrename [#channel] <new name>',
  usage: '[#channel] <new name>',
  cooldown: 3,
  permissions: ['ManageChannels'],
  args: true,
  async execute(message, args, client) {
    const ch = message.mentions.channels.first() || message.channel;
    const name = args.slice(message.mentions.channels.first() ? 1 : 0).join('-').toLowerCase();
    if (!name) return message.reply('Provide a new name.');
    await ch.setName(name);
    return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Renamed to \`${name}\`.`})] });
  },
};
