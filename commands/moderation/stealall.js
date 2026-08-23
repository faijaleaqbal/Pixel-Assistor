// src/commands/moderation/stealall.js
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'stealall',
  category: 'moderation',
  description: 'Steal all custom emojis from the referenced or last message.',
  usage: '',
  cooldown: 10,
  permissions: ['ManageEmojisAndStickers'],
  async execute(message) {
    const ref = message.reference
      ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
      : null;
    const target = ref || (await message.channel.messages.fetch({ limit: 2 }).then(m => m.last()));
    if (!target) return message.reply(opts(responseBuilder.buildResult({ description: 'No message found.'})));

    const custom = [...new Set((target.content.match(/<a?:[\w]+:\d+>/g) || []))];
    if (!custom.length) return message.reply(opts(responseBuilder.buildResult({ description: 'No custom emojis found.'})));

    // Discord's emoji limit depends on the guild's premium tier — use the
    // authoritative value when available. Fall back to the formula only if needed.
    const maxEmojis = typeof message.guild.maximumEmojis === 'number'
      ? message.guild.maximumEmojis
      : 50 + (message.guild.premiumTier || 0) * 50;
    if (message.guild.emojis.cache.size >= maxEmojis)
      return message.reply(opts(responseBuilder.buildResult({ description: 'Server emoji limit reached.'})));

    const results = [];
    for (const emoji of custom) {
      try {
        const id = emoji.match(/\d+/)[0];
        const e = await message.client.emojis.fetch(id).catch(() => null);
        if (!e) { results.push(`❌ ${emoji} — not found`); continue; }
        if (message.guild.emojis.cache.has(e.id)) { results.push(`⏭️ ${e.name} — already exists`); continue; }
        const url = e.animated ? `https://cdn.discordapp.com/emojis/${e.id}.gif` : `https://cdn.discordapp.com/emojis/${e.id}.png`;
        await message.guild.emojis.create({ attachment: url, name: e.name });
        results.push(`✅ ${e.name}`);
      } catch (err) { results.push(`❌ ${emoji} — ${err.message}`); }
    }
    return message.reply(opts(responseBuilder.buildResult({ title: 'Steal Results', description: results.join('\n')})));
  },
};
