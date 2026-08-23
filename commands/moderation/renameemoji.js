// src/commands/moderation/renameemoji.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'renameemoji',
  category: 'moderation',
  aliases: ['rme'],
  description: 'Rename an emoji. Usage: renameemoji <emoji> <newName>',
  usage: '<emoji> <newName>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const match = args[0].match(/<a?:\w+:(\d+)>/);
    if (!match) return message.reply(opts(buildContainer({ description: 'Provide a custom emoji.' })));
    const name = args.slice(1).join('_');
    if (!name) return message.reply(opts(buildContainer({ description: 'Provide a new name.' })));
    const emoji = await message.guild.emojis.fetch(match[1]).catch(() => null);
    if (!emoji) return message.reply(opts(buildContainer({ description: 'Emoji not found.' })));
    await emoji.setName(name);
    return message.reply(opts(responseBuilder.buildResult({ description: `✅ Renamed to \`${name}\`.`})));
  },
};
