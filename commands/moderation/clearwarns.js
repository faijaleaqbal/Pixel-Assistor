// src/commands/moderation/clearwarns.js
const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { resolveMemberArg } = require('../../utils/resolveUser');
module.exports = {
  name: 'clearwarns', aliases: ['cw'], category: 'moderation',
  description: 'Clear all warnings for a member. Accepts @user or raw userID.',
  usage: '<@user|userID>',
  cooldown: 3, permissions: ['ModerateMembers'], args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    const count = await getDb().warn.clear(target.id, message.guild.id);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Cleared ${count} warning(s) for ${target.user.tag}.`)] });
  },
};
