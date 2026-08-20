// src/commands/fun/leaderboard.js
const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'leaderboard',
  aliases: ['lb'],
  category: 'fun',
  description: 'Show the server XP leaderboard.',
  usage: '',
  cooldown: 5,
  async execute(message) {
    const rows = await getDb().level.top(message.guild.id, 10);
    if (!rows.length) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'No one has XP yet!'})] });
    const fields = rows.map((r, i) => ({ name: `#${i + 1} <@${r.userId}>`, value: `Level ${r.level || 0} \u2014 ${r.xp || 0} XP`, inline: true }));
    return message.reply({ embeds: [responseBuilder.buildResult({ title: '\uD83C\uDFC6 Leaderboard', fields: [fields]})], allowedMentions: { parse: [] } });
  },
};
