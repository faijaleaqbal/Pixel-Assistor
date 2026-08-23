// src/commands/moderation/delsticker.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'delsticker',
  category: 'moderation',
  aliases: ['dst'],
  description: 'Delete a sticker by name or ID. Usage: delsticker <name|id>',
  usage: '<name|id>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const q = args.join(' ');
    const stickers = await message.guild.stickers.fetch();
    const s = stickers.find((x) => x.id === q || x.name.toLowerCase() === q.toLowerCase());
    if (!s) return message.reply(opts(buildContainer({ description: 'Sticker not found.' })));
    await s.delete();
    return message.reply(opts(responseBuilder.buildResult({ description: `🗑️ Deleted sticker \`${s.name}\`.`})));
  },
};
