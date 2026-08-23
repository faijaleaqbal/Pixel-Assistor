// src/commands/moderation/renamesticker.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'renamesticker',
  category: 'moderation',
  aliases: ['rst'],
  description: 'Rename a sticker. Usage: renamesticker <name|id> <newName>',
  usage: '<name|id> <newName>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const q = args[0];
    const newName = args.slice(1).join('_');
    if (!newName) return message.reply(opts(buildContainer({ description: 'Provide a new name.' })));
    const stickers = await message.guild.stickers.fetch();
    const s = stickers.find((x) => x.id === q || x.name.toLowerCase() === q.toLowerCase());
    if (!s) return message.reply(opts(buildContainer({ description: 'Sticker not found.' })));
    await s.setName(newName);
    return message.reply(opts(responseBuilder.buildResult({ description: `✅ Renamed to \`${newName}\`.`})));
  },
};
