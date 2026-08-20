// src/commands/moderation/steal.js
// Steal emojis or stickers by attachment or URL. Usage: steal <name> [emoji|url]

const responseBuilder = require('../../utils/responseBuilder');

module.exports = {
  name: 'steal',
  category: 'moderation',
  aliases: ['stl'],
  description: 'Steal an emoji or sticker from an attachment or URL. Usage: steal <name> [url]',
  usage: '<name> [url]',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args, client) {
    const name = args[0];
    const url = args[1] || message.attachments.first()?.url;
    if (!name || !url) return message.reply('Usage: `steal <name> [url]` — attach an image or pass a URL.');
    try {
      if (/\.gif/.test(url)) {
        const e = await message.guild.emojis.create({ attachment: url, name });
        return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Stole emoji ${e} (\`${name}\`)`})] });
      }
      const e = await message.guild.emojis.create({ attachment: url, name });
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Stole emoji ${e} (\`${name}\`)`})] });
    } catch (e) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `Failed: ${e.message}`})] });
    }
  },
};
