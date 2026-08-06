// src/commands/moderation/modstats.js

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'modstats',
  aliases: ['ms'],
  category: 'moderation',
  description: 'Show moderation stats for a user. Accepts @user or raw userID.',
  usage: '[@user|userID]',
  cooldown: 3,
  permissions: ['ModerateMembers'],
  async execute(message, args) {
    const target = args && args[0]
      ? (await resolveMemberArg(message, args[0], { silent: true })) || message.member
      : message.member;
    const db = getDb();
    let warns = [];
    try {
      warns = await db.warn.list(target.id, message.guild.id);
    } catch { /* db not ready */ }
    const joinDate = target.joinedAt ? `<t:${Math.floor(target.joinedAt.getTime() / 1000)}:R>` : 'Unknown';
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Mod Stats: ${target.user.tag}`)
      .addFields(
        { name: 'Warnings', value: String(warns.length), inline: true },
        { name: 'Roles', value: String(target.roles.cache.size - 1), inline: true },
        { name: 'Joined', value: joinDate, inline: true }
      )
      .setThumbnail(target.user.displayAvatarURL({ size: 128 }))], allowedMentions: { parse: [] } });
  },
};
