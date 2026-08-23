// src/commands/utility/enlarge.js
// Show a custom emoji at full size.

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'enlarge',
  category: 'utility',
  description: 'Show a custom emoji at full size. Usage: enlarge <emoji>',
  usage: '<emoji>',
  cooldown: 3,
  async execute(message, args, client) {
    const input = args.join(' ').trim();
    if (!input) return message.reply(opts(buildContainer({ description: 'Please provide an emoji.' })));

    const customMatch = input.match(/<a?:\w+:(\d+)>/);
    if (customMatch) {
      const id = customMatch[1];
      const isAnimated = input.startsWith('<a:');
      const ext = isAnimated ? 'gif' : 'png';
      const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=4096`;

      const embed = responseBuilder.buildResult({ title: '🔍 Enlarged Emoji', image: url});

      return message.reply(opts(embed));
    }

    const embed = responseBuilder.buildResult({ title: '🔍 Emoji', description: input});

    return message.reply(opts(embed));
  },
};
