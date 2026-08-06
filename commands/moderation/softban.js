// src/commands/moderation/softban.js
// Ban then immediately unban — removes messages from last 24h but user can rejoin.
const { EmbedBuilder } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');
module.exports = {
  name: 'softban', aliases: ['sb'], category: 'moderation',
  description: 'Softban a user (ban + unban, clears recent messages). Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3, permissions: ['BanMembers'], args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    if (!target.bannable) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Cannot softban this user (hierarchy/permissions).')] });
    const reason = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided.';
    try {
      await target.ban({ deleteMessageSeconds: 86400, reason });
      await message.guild.members.unban(target.id, 'Softban — auto-unban').catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🔨 ${target.user.tag} was softbanned (banned + unbanned). Messages from last 24h deleted.
**Reason:** ${reason}`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${e.message}`)] });
    }
  },
};
