// src/commands/utility/editsnipe.js

const responseBuilder = require('../../utils/responseBuilder');
const snipe = require('../../utils/snipeCache');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'editsnipe',
  aliases: ['es'],
  category: 'utility',
  description: 'Show recently edited messages in this channel. Usage: editsnipe [count]',
  usage: '[count]',
  cooldown: 3,
  async execute(message, args, client) {
    const n = Math.min(parseInt(args[0], 10) || 1, 10);
    const list = snipe.getEdited(message.channelId, n);
    if (!list.length) return message.reply(opts(responseBuilder.buildResult({ description: 'Nothing to editsnipe.'})));
    const containers = list.filter((e) => e.author).map((e) => responseBuilder.buildResult({ description: `-# ${e.author.tag}`, fields: [{ name: 'Before', value: (e.before || '').slice(0, 1024) || '(empty)' },
        { name: 'After', value: (e.after || '').slice(0, 1024) || '(empty)' },]}));
    return message.reply(opts(containers));
  },
};
