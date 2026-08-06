// src/commands/utility/userinfo.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'userinfo',
  category: 'utility',
  description: 'Show info about a user. Accepts @user or raw userID.',
  usage: '<@user|userID>',
  aliases: ['ui'],
  cooldown: 3,
  async execute(message, args) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true })) || message.author
      : message.author;
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (!member) return message.reply({ content: 'Member not found in this guild.', allowedMentions: { parse: [] } });

    const roles = member.roles.cache.filter((r) => r.id !== message.guild.id).map((r) => `<@&${r.id}>`).slice(0, 15).join(', ') || '—';
    let warns = 0;
    let reaction = 0;
    try {
      warns = (await getDb().warn.list(target.id, message.guild.id)).length;
      reaction = (await getDb().reactionStat.get(target.id, message.guild.id)).wins || 0;
    } catch { /* db not ready */ }

    const e = new EmbedBuilder()
      .setColor(member.displayHexColor || config.embedColor)
      .setTitle(`👤 ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: 'ID', value: target.id, inline: true },
        { name: 'Bot', value: target.bot ? 'Yes' : 'No', inline: true },
        { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Warns', value: String(warns), inline: true },
        { name: 'Reaction Wins', value: String(reaction), inline: true },
        { name: `Roles [${member.roles.cache.size - 1}]`, value: roles, inline: false },
      )
      .setTimestamp();
    return message.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};
