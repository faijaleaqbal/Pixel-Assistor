// src/commands/moderation/timeout.js
const { EmbedBuilder } = require('discord.js');
const ms = require('../../utils/ms');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'timeout', aliases: ['to'], category: 'moderation',
  description: 'Timeout a member. Accepts @user or raw userID.',
  usage: '<@user|userID> <duration> [reason]',
  cooldown: 3, permissions: ['ModerateMembers'], args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    if (!target.moderatable) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Cannot timeout this user (hierarchy/permissions).')] });
    }
    const durStr = args[1];
    const durMs = ms.parse(durStr);
    if (!durMs || durMs < 1000 || durMs > 28 * 86400_000) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Invalid duration. Use: `1s`, `5m`, `1h`, `1d`. Max 28 days.')] });
    }
    const reason = args.slice(2).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided.';
    try {
      await target.timeout(durMs, reason);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\uD83D\uDD12 ${target.user.tag} has been timed out for ${durStr}.\n**Reason:** ${reason}`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${e.message}`)] });
    }
  },
};
