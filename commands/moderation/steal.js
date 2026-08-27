// src/commands/moderation/steal.js
// Steal custom emojis or stickers by emoji mention, URL, or attachment.
// Krypton-style flexible parser: supports `.steal <emoji>`, `.steal <name> <emoji|url>`, `.steal` with attachment, etc.

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');
const { getPrefix } = require('../../utils/prefixCache');

const EMOJI_REGEX = /<(a)?:([a-zA-Z0-9_]{2,32}):(\d{17,21})>/g;

function sanitizeEmojiName(name) {
  if (!name) return 'emoji_' + Math.floor(Math.random() * 1000);
  let clean = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  if (clean.length < 2) clean = clean + '_em';
  return clean.slice(0, 32);
}

module.exports = {
  name: 'steal',
  category: 'moderation',
  aliases: ['stl'],
  description: 'Steal an emoji or sticker from a custom emoji, URL, or attachment.',
  usage: '<emoji | [name] <emoji|url> | [name] with attachment>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: false,

  async execute(message, args, client) {
    const prefix = await getPrefix(message.guild?.id);
    const content = args.join(' ');
    const emojiMatches = [...content.matchAll(EMOJI_REGEX)];

    // ── Case 1: Multiple or Single custom emojis pasted directly (e.g. `?steal <:pepe:123> <a:fire:456>`) ──
    if (emojiMatches.length > 0 && !args[1]?.match(/^https?:\/\//i) && (!args[0] || args[0].startsWith('<'))) {
      const results = [];
      let successCount = 0;

      for (const match of emojiMatches) {
        const isAnimated = Boolean(match[1]);
        const emojiName = match[2];
        const emojiId = match[3];
        const url = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? 'gif' : 'png'}?quality=lossless`;

        try {
          const created = await message.guild.emojis.create({
            attachment: url,
            name: sanitizeEmojiName(emojiName),
            reason: `Stolen by ${message.author.tag} (${message.author.id})`,
          });
          results.push(`• ${created} (\`${created.name}\`)`);
          successCount++;
        } catch (err) {
          results.push(`• ❌ \`${emojiName}\` — ${err.message}`);
        }
      }

      if (emojiMatches.length === 1 && successCount === 1) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '👑 Emoji Created',
            description: `**Successfully created 1/1 Emojis**\n${results.join('\n')}`,
          }))
        );
      }

      return message.reply(
        opts(responseBuilder.buildResult({
          title: '👑 Steal Results',
          description: `**Successfully created ${successCount}/${emojiMatches.length} Emojis**\n\n${results.join('\n')}`,
        }))
      );
    }

    // ── Case 2: Custom Name + Custom Emoji (e.g. `?steal my_custom_name <:pepe:123>`) ──
    if (args.length >= 2 && emojiMatches.length === 1 && !args[0].startsWith('<')) {
      const customName = sanitizeEmojiName(args[0]);
      const match = emojiMatches[0];
      const isAnimated = Boolean(match[1]);
      const emojiId = match[3];
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? 'gif' : 'png'}?quality=lossless`;

      try {
        const created = await message.guild.emojis.create({
          attachment: url,
          name: customName,
          reason: `Stolen by ${message.author.tag} (${message.author.id})`,
        });
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '👑 Emoji Created',
            description: `**Successfully created 1/1 Emojis**\n• ${created} (\`${created.name}\`)`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '❌ Steal Failed',
            description: `Could not create emoji \`${customName}\`: ${err.message}`,
          }))
        );
      }
    }

    // ── Case 3: Custom Name + Image URL (e.g. `?steal pepe https://example.com/pepe.png`) ──
    const urlArg = args.find((a) => /^https?:\/\//i.test(a));
    if (urlArg) {
      let customName = args.find((a) => a !== urlArg && !a.startsWith('<')) || 'stolen_emoji';
      customName = sanitizeEmojiName(customName);

      try {
        const created = await message.guild.emojis.create({
          attachment: urlArg,
          name: customName,
          reason: `Stolen by ${message.author.tag} (${message.author.id})`,
        });
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '👑 Emoji Created',
            description: `**Successfully created 1/1 Emojis**\n• ${created} (\`${created.name}\`)`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '❌ Steal Failed',
            description: `Could not create emoji from URL: ${err.message}`,
          }))
        );
      }
    }

    // ── Case 4: Image Attachment in Message (e.g. `?steal [name]` or just `?steal`) ──
    const attachment = message.attachments?.first();
    if (attachment && attachment.contentType?.startsWith('image/')) {
      let customName = args[0]
        ? sanitizeEmojiName(args[0])
        : sanitizeEmojiName(attachment.name?.replace(/\.[^/.]+$/, '') || 'stolen_emoji');

      try {
        const created = await message.guild.emojis.create({
          attachment: attachment.url,
          name: customName,
          reason: `Stolen by ${message.author.tag} (${message.author.id})`,
        });
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '👑 Emoji Created',
            description: `**Successfully created 1/1 Emojis**\n• ${created} (\`${created.name}\`)`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '❌ Steal Failed',
            description: `Could not create emoji from attachment: ${err.message}`,
          }))
        );
      }
    }

    // ── Case 5: Referenced / Replied Message ──
    if (message.reference?.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId);
        if (refMsg) {
          const refEmojiMatches = [...(refMsg.content || '').matchAll(EMOJI_REGEX)];
          if (refEmojiMatches.length > 0) {
            const match = refEmojiMatches[0];
            const isAnimated = Boolean(match[1]);
            const emojiName = args[0] ? sanitizeEmojiName(args[0]) : sanitizeEmojiName(match[2]);
            const emojiId = match[3];
            const url = `https://cdn.discordapp.com/emojis/${emojiId}.${isAnimated ? 'gif' : 'png'}?quality=lossless`;

            const created = await message.guild.emojis.create({
              attachment: url,
              name: emojiName,
              reason: `Stolen by ${message.author.tag} (${message.author.id})`,
            });
            return message.reply(
              opts(responseBuilder.buildResult({
                title: '👑 Emoji Created',
                description: `**Successfully created 1/1 Emojis from referenced message**\n• ${created} (\`${created.name}\`)`,
              }))
            );
          }

          const refAttachment = refMsg.attachments?.first();
          if (refAttachment && refAttachment.contentType?.startsWith('image/')) {
            const emojiName = args[0]
              ? sanitizeEmojiName(args[0])
              : sanitizeEmojiName(refAttachment.name?.replace(/\.[^/.]+$/, '') || 'stolen_emoji');

            const created = await message.guild.emojis.create({
              attachment: refAttachment.url,
              name: emojiName,
              reason: `Stolen by ${message.author.tag} (${message.author.id})`,
            });
            return message.reply(
              opts(responseBuilder.buildResult({
                title: '👑 Emoji Created',
                description: `**Successfully created 1/1 Emojis from referenced attachment**\n• ${created} (\`${created.name}\`)`,
              }))
            );
          }
        }
      } catch {}
    }

    // ── No valid emoji, URL, or attachment found ──
    return message.reply(
      opts(buildContainer({
        description: `❌ Please provide a custom emoji, image URL, or attach an image file.\n\n` +
          `**Usage Examples:**\n` +
          `• \`${prefix}steal <:emoji:123456789012345678>\`\n` +
          `• \`${prefix}steal <custom_name> <:emoji:123456789012345678>\`\n` +
          `• \`${prefix}steal <name> <image_url>\`\n` +
          `• \`${prefix}steal [name]\` *(with image attached or replying to a message)*`,
      }))
    );
  },
};
