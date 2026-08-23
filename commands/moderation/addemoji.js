// src/commands/moderation/addemoji.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'addemoji',
  category: 'moderation',
  description: 'Add an emoji from a URL. Usage: addemoji <name> <url>',
  usage: '<name> <url>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const name = args[0];
    const url = args[1];
    if (!name || !url) return message.reply(opts(buildContainer({ description: 'Usage: `addemoji <name> <url>`' })));
    try {
      const emoji = await message.guild.emojis.create({ name, attachment: url, reason: `Added by ${message.author.tag}` });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Emoji added: ${emoji} \`${name}\``})));
    } catch (err) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to add emoji: ${err.message}`})));
    }
  },
};
