// src/commands/utility/editsnipe.js

const responseBuilder = require('../../utils/responseBuilder');
const snipe = require('../../utils/snipeCache');

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
    if (!list.length) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Nothing to editsnipe.'})] });
    const embeds = list.filter((e) => e.author).map((e) => responseBuilder.buildResult({ fields: [{ name: 'Before', value: (e.before || '').slice(0, 1024) || '(empty)' },
        { name: 'After', value: (e.after || '').slice(0, 1024) || '(empty)' },], author: { name: e.author.tag, iconURL: e.author.displayAvatarURL() }}));
    return message.reply({ embeds });
  },
};
