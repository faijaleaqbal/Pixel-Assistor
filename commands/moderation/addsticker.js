// src/commands/moderation/addsticker.js

const responseBuilder = require('../../utils/responseBuilder');

module.exports = {
  name: 'addsticker',
  category: 'moderation',
  description: 'Add a sticker from a URL. Usage: addsticker <name> <url> [description]',
  usage: '<name> <url> [description]',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const name = args[0];
    const url = args[1];
    if (!name || !url) return message.reply('Usage: `addsticker <name> <url> [description]`');
    const description = args.slice(2).join(' ') || name;
    try {
      // Discord requires `tags` to be a unicode emoji (used as the sticker's
      // related emoji). Passing the description (free text) causes a 400.
      // We default to ✨ if the description is multi-char / not an emoji.
      const tags = /^(\p{Extended_Pictographic}|\p{Emoji})$/u.test(description) ? description : '✨';
      const sticker = await message.guild.stickers.create({ name, file: url, tags, description });
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Sticker added: **${sticker.name}** (\`${sticker.id}\`)`})] });
    } catch (err) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `Failed to add sticker: ${err.message}`})] });
    }
  },
};
