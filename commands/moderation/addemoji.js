// src/commands/moderation/addemoji.js
// Add custom emojis by emoji mention, URL, or attachment.

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

const EMOJI_REGEX = /<(a)?:([a-zA-Z0-9_]{2,32}):(\d{17,21})>/;

function sanitizeEmojiName(name) {
  if (!name) return 'emoji_' + Math.floor(Math.random() * 1000);
  let clean = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  if (clean.length < 2) clean = clean + '_em';
  return clean.slice(0, 32);
}

module.exports = {
  name: 'addemoji',
  category: 'moderation',
  description: 'Add an emoji from a custom emoji, URL, or attachment.',
  usage: '<emoji | <name> <url> | [name] with attachment>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: false,

  async execute(message, args, client) {
    const content = args.join(' ');
    const emojiMatch = content.match(EMOJI_REGEX);

    // 1. Direct emoji mention
    if (emojiMatch) {
      const isAnimated = Boolean(emojiMatch[1]);
      const emojiName = args[0] && !args[0].startsWith('<') ? sanitizeEmojiName(args[0]) : sanitizeEmojiName(emojiMatch[2]);
      const emojiId = emojiMatch[3];
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? 'gif' : 'png'}?quality=lossless`;

      try {
        const emoji = await message.guild.emojis.create({
          name: emojiName,
          attachment: url,
          reason: `Added by ${message.author.tag}`,
        });
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Emoji added: ${emoji} \`${emoji.name}\`` })));
      } catch (err) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed to add emoji: ${err.message}` })));
      }
    }

    // 2. Name + URL
    const urlArg = args.find((a) => /^https?:\/\//i.test(a));
    if (urlArg) {
      const name = sanitizeEmojiName(args.find((a) => a !== urlArg) || 'new_emoji');
      try {
        const emoji = await message.guild.emojis.create({
          name,
          attachment: urlArg,
          reason: `Added by ${message.author.tag}`,
        });
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Emoji added: ${emoji} \`${emoji.name}\`` })));
      } catch (err) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed to add emoji: ${err.message}` })));
      }
    }

    // 3. Attachment
    const attachment = message.attachments?.first();
    if (attachment && attachment.contentType?.startsWith('image/')) {
      const name = sanitizeEmojiName(args[0] || attachment.name?.replace(/\.[^/.]+$/, '') || 'new_emoji');
      try {
        const emoji = await message.guild.emojis.create({
          name,
          attachment: attachment.url,
          reason: `Added by ${message.author.tag}`,
        });
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Emoji added: ${emoji} \`${emoji.name}\`` })));
      } catch (err) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed to add emoji: ${err.message}` })));
      }
    }

    return message.reply(opts(buildContainer({ description: 'Usage: `addemoji <custom_emoji | [name] <url> | [name] with attachment>`' })));
  },
};
