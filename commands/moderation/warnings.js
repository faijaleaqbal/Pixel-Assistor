// src/commands/moderation/warnings.js
const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { resolveMemberArg } = require('../../utils/resolveUser');
module.exports = {
  name: 'warnings', aliases: ['warns'], category: 'moderation',
  description: 'View warnings for a member. Accepts @user or raw userID.',
  usage: '<@user|userID>',
  cooldown: 3, permissions: ['ModerateMembers'], args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    const rows = await getDb().warn.list(target.id, message.guild.id);
    if (!rows.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`${target.user.tag} has no warnings.`)] });
    const fields = rows.slice(0, 15).map((r, i) => ({
      name: `#${i + 1} — <t:${Math.floor(r.at / 1000)}:R>`,
      value: `${r.reason} *(by <@${r.moderatorId}>)*`,
      inline: false,
    }));
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`⚠️ Warnings for ${target.user.tag} (${rows.length})`).addFields(fields)] });
  },
};
