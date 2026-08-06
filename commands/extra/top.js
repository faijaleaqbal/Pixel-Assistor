// src/commands/extra/top.js
// Leaderboard / top stats — reaction wins and RPS wins.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'top',
  category: 'extra',
  description: 'Leaderboard for reaction and RPS games.',
  usage: '[reaction|rps]',
  cooldown: 5,
  async execute(message, args) {
    const type = (args[0] || 'reaction').toLowerCase();
    const db = getDb();
    const guildId = message.guild.id;
    let rows;
    let title;
    let valueFn;
    if (type === 'rps') {
      rows = await db.rpsStat.top(guildId, 10);
      title = '🎮 RPS Top 10';
      valueFn = (r) => `Wins: ${r.wins} • Losses: ${r.losses} • Ties: ${r.ties}`;
    } else {
      rows = await db.reactionStat.top(guildId, 10);
      title = '⚡ Reaction Top 10';
      valueFn = (r) => `${r.wins} wins`;
    }
    if (!rows.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No data yet — play a few rounds first.')] });

    const fields = rows.map((r, i) => ({
      name: `#${i + 1} — <@${r.userId}>`,
      value: valueFn(r),
      inline: false,
    }));
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle(title).addFields(fields).setTimestamp()], allowedMentions: { parse: [] } });
  },
};
