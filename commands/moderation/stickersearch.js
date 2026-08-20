const responseBuilder = require('../../utils/responseBuilder');
// src/commands/moderation/stickersearch.js

const { StickerFormatType } = require('discord.js');

const FORMAT_NAMES = {
  [StickerFormatType.PNG]: 'PNG',
  [StickerFormatType.APNG]: 'APNG',
  [StickerFormatType.LOTTIE]: 'LOTTIE',
  [StickerFormatType.GIF]: 'GIF',
};

module.exports = {
  name: 'stickersearch',
  category: 'moderation',
  description: 'Search guild stickers by name. Usage: stickersearch <name>',
  usage: '<name>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const query = args.join(' ').toLowerCase();
    if (!query) return message.reply('Usage: `stickersearch <name>`');
    const stickers = message.guild.stickers.cache.filter(s => s.name.toLowerCase().includes(query));
    if (!stickers.size) return message.reply({ embeds: [responseBuilder.buildResult({ description: `No stickers found matching \`${query}\`.`})] });
    const list = stickers.map(s => `**${s.name}** — \`${s.id}\` (${FORMAT_NAMES[s.format] || String(s.format)})`).join('\n');
    return message.reply({ embeds: [responseBuilder.buildResult({ title: `Sticker Search: ${query}`, description: list})] });
  },
};
