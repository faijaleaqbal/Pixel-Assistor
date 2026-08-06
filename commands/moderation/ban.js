// src/commands/moderation/ban.js

const { EmbedBuilder } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'ban',
  category: 'moderation',
  description: 'Ban a member from the server. Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['BanMembers'],
  args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    if (!target.bannable) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('I cannot ban that member — they may have a higher role than me.')] });
    const reason = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await target.ban({ reason });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🔨 Banned ${target.user.tag} — ${reason}`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to ban: ${e.message}`)] });
    }
  },
};
