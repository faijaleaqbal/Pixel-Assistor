// src/commands/games/reactionstats.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'reactionstats',
  category: 'games',
  aliases: ['rcs'],
  description: 'Show reaction-game wins for yourself or another user. Accepts @user or raw userID.',
  usage: '[@user|userID]',
  cooldown: 3,
  async execute(message, args) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true })) || message.author
      : message.author;
    let row = { wins: 0 };
    try {
      row = await getDb().reactionStat.get(target.id, message.guild.id);
    } catch { /* db not ready */ }
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(`⚡ Reaction stats — ${target.username}`)
      .addFields({ name: 'Wins', value: String(row.wins || 0), inline: true })
      .setTimestamp()], allowedMentions: { parse: [] } });
  },
};
