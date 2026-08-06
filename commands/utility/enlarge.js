// src/commands/utility/enlarge.js
// Show a custom emoji at full size.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'enlarge',
  category: 'utility',
  description: 'Show a custom emoji at full size. Usage: enlarge <emoji>',
  usage: '<emoji>',
  cooldown: 3,
  async execute(message, args) {
    const input = args.join(' ').trim();
    if (!input) return message.reply('Please provide an emoji.');

    const customMatch = input.match(/<a?:\w+:(\d+)>/);
    if (customMatch) {
      const id = customMatch[1];
      const isAnimated = input.startsWith('<a:');
      const ext = isAnimated ? 'gif' : 'png';
      const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=4096`;

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🔍 Enlarged Emoji')
        .setImage(url)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle('🔍 Emoji')
      .setDescription(input)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
