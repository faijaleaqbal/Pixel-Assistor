const responseBuilder = require('../../utils/responseBuilder');
// src/commands/moderation/timeout.js
const { PermissionsBitField } = require('discord.js');
const ms = require('../../utils/ms');
const { resolveMemberArg } = require('../../utils/resolveUser');
const logger = require('../../utils/logger');

module.exports = {
  name: 'timeout',
  aliases: ['to'],
  category: 'moderation',
  description: 'Timeout a member. Accepts @user or raw userID.',
  usage: '<@user|userID> <duration> [reason]',
  cooldown: 3,
  permissions: ['ModerateMembers'],
  args: true,

  async execute(message, args, client) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;

    // 1. Target validation
    if (target.id === message.guild.ownerId) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ You cannot timeout the server owner.'})] });
    }
    if (target.id === message.author.id) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ You cannot timeout yourself.'})] });
    }
    if (target.id === message.client.user.id) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ I cannot timeout myself.'})] });
    }

    // 2. Bot permissions check
    if (!message.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply({
        embeds: [responseBuilder.buildResult({ description: '❌ I do not have permission to **Timeout Members** in this server.'})],
      });
    }

    // 3. Hierarchy check
    if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ You cannot timeout that member — they have an equal or higher role than you.'})] });
    }
    if (!target.moderatable) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ I cannot timeout that member — their highest role is equal to or above my highest role.'})] });
    }

    // 4. Duration parsing
    const durStr = args[1];
    const durMs = ms.parse(durStr);
    if (!durMs || durMs < 1000 || durMs > 28 * 86400_000) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ Invalid duration. Use: `1s`, `5m`, `1h`, `1d`. Max 28 days.'})] });
    }

    const reason = args.slice(2).filter((a) => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided.';
    try {
      await target.timeout(durMs, `${reason} (by ${message.author.tag})`);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `🔒 **${target.user.tag}** has been timed out for \`${durStr}\`.\n**Reason:** ${reason}`})] });
    } catch (e) {
      logger.error('timeout error', e?.stack || e?.message || e);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ Failed to timeout this member. Please check role hierarchy.'})] });
    }
  },
};
