// src/commands/moderation/delemoji.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'delemoji',
  category: 'moderation',
  aliases: ['dme'],
  description: 'Delete an emoji. Usage: delemoji <emoji>',
  usage: '<emoji>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const match = args[0].match(/<a?:\w+:(\d+)>/);
    if (!match) return message.reply(opts(buildContainer({ description: 'Provide a custom emoji.' })));
    const emoji = await message.guild.emojis.fetch(match[1]).catch(() => null);
    if (!emoji) return message.reply(opts(buildContainer({ description: 'Emoji not found in this guild.' })));
    await emoji.delete();
    return message.reply(opts(responseBuilder.buildResult({ description: `🗑️ Deleted emoji \`${emoji.name}\`.`})));
  },
};
