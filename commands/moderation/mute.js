// src/commands/moderation/mute.js
// Apply a timeout (Discord's built-in timeout feature).

const { EmbedBuilder } = require('discord.js');
const ms = require('../../utils/ms');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'mute',
  category: 'moderation',
  aliases: ['mt'],
  description: 'Timeout a member. Accepts @user or raw userID.',
  usage: '<@user|userID> <duration> [reason]',
  cooldown: 3,
  permissions: ['ModerateMembers'],
  args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    if (!target.moderatable) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('I cannot timeout that member — they may have a higher role than me.')] });

    // Find the duration token (skip the user-mention/ID arg).
    const durStr = args[1];
    const duration = ms.parse(durStr);
    if (!duration || duration < 1000 || duration > ms.days(28)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Duration must be between 1s and 28d. Example: `10m`, `2h`, `1d`.')] });
    }

    const reason = args.slice(2).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await target.timeout(duration, reason);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🔇 Muted ${target.user.tag} for ${ms.format(duration)} — ${reason}`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to mute: ${e.message}`)] });
    }
  },
};
