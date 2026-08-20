// src/commands/fun/rank.js
const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');
const { resolveUserArg } = require('../../utils/resolveUser');
const XP_PER_LEVEL = 100;

module.exports = {
  name: 'rank', category: 'fun',
  description: "Check your or another user's XP and level. Accepts @user or raw userID.",
  usage: '[@user|userID]', cooldown: 3,
  async execute(message, args, client) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true })) || message.author
      : message.author;
    let data = { xp: 0, level: 0 };
    try {
      data = await getDb().level.get(target.id, message.guild.id);
    } catch { /* db not ready */ }
    const xp = data.xp || 0;
    const level = data.level || 0;
    const xpNeeded = (level + 1) * XP_PER_LEVEL;
    const pct = Math.min((xp / xpNeeded) * 10, 10);
    const bar = '\u2588'.repeat(Math.floor(pct)) + '\u2591'.repeat(10 - Math.floor(pct));
    return message.reply({ embeds: [responseBuilder.buildResult({ title: `\uD83C\uDFC6 ${target.username}'s Rank`, fields: [{ name: 'Level', value: `\`\`${level}\`\``, inline: true },
      { name: 'XP', value: `\`\`${xp}/${xpNeeded}\`\``, inline: true },
      { name: 'Progress', value: bar, inline: false },], thumbnail: target.displayAvatarURL({ size: 128 })})], allowedMentions: { parse: [] } });
  },
};
