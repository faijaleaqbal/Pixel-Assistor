// src/commands/moderation/kick.js

const { EmbedBuilder } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'kick',
  category: 'moderation',
  description: 'Kick a member from the server. Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['KickMembers'],
  args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    if (!target.kickable) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('I cannot kick that member — they may have a higher role than me.')] });
    const reason = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await target.kick(reason);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`👢 Kicked ${target.user.tag} — ${reason}`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to kick: ${e.message}`)] });
    }
  },
};
