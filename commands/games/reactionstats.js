// src/commands/games/reactionstats.js

const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'reactionstats',
  category: 'games',
  aliases: ['rcs'],
  description: 'Show reaction-game wins for yourself or another user. Accepts @user or raw userID.',
  usage: '[@user|userID]',
  cooldown: 3,
  async execute(message, args, client) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true })) || message.author
      : message.author;
    let row = { wins: 0 };
    try {
      row = await getDb().reactionStat.get(target.id, message.guild.id);
    } catch { /* db not ready */ }
    return message.reply({ embeds: [responseBuilder.buildResult({ title: `⚡ Reaction stats — ${target.username}`, fields: [{ name: 'Wins', value: String(row.wins || 0), inline: true }]})], allowedMentions: { parse: [] } });
  },
};
