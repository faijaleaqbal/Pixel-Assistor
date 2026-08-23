// src/commands/utility/snipe.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const snipe = require('../../utils/snipeCache');

module.exports = {
  name: 'snipe',
  aliases: ['s', 'sn'],
  category: 'utility',
  description: 'Show recently deleted messages in this channel. Usage: snipe [count]',
  usage: '[count]',
  cooldown: 3,
  async execute(message, args, client) {
    const n = Math.min(parseInt(args[0], 10) || 1, 10);
    const list = snipe.getDeleted(message.channelId, n);
    if (!list.length) return message.reply(opts(responseBuilder.buildResult({ description: 'Nothing to snipe.'})));
    const embeds = list.filter((e) => e.author).map((e) => responseBuilder.buildResult({ description: e.content || '(empty)', image: e.attachment || null, author: { name: e.author.tag, iconURL: e.author.displayAvatarURL() }}));
    return message.reply(opts(embeds));
  },
};
