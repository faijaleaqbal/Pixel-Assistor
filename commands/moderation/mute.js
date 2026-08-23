const responseBuilder = require('../../utils/responseBuilder');
// src/commands/moderation/mute.js
// Apply a timeout (Discord's built-in timeout feature).

const { PermissionsBitField } = require('discord.js');
const ms = require('../../utils/ms');
const { resolveMemberArg } = require('../../utils/resolveUser');
const { opts } = require('../../utils/v2Reply');
const logger = require('../../utils/logger');

module.exports = {
  name: 'mute',
  category: 'moderation',
  aliases: ['mt'],
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
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot mute the server owner.'})));
    }
    if (target.id === message.author.id) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot mute yourself.'})));
    }
    if (target.id === message.client.user.id) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ I cannot mute myself.'})));
    }

    // 2. Bot permissions check
    if (!message.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ I do not have permission to **Timeout Members** in this server.'})),
      );
    }

    // 3. Hierarchy check
    if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot mute that member — they have an equal or higher role than you.'})));
    }
    if (!target.moderatable) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ I cannot mute that member — their highest role is equal to or above my highest role.'})));
    }

    // 4. Duration parsing
    const durStr = args[1];
    const duration = ms.parse(durStr);
    if (!duration || duration < 1000 || duration > ms.days(28)) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ Duration must be between 1s and 28d. Example: `10m`, `2h`, `1d`.'})));
    }

    const reason = args.slice(2).filter((a) => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await target.timeout(duration, `${reason} (by ${message.author.tag})`);
      return message.reply(opts(responseBuilder.buildResult({ description: `🔇 Muted **${target.user.tag}** for \`${ms.format(duration)}\` — ${reason}`})));
    } catch (e) {
      logger.error('mute error', e?.stack || e?.message || e);
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ Failed to mute this member. Please check role hierarchy.'})));
    }
  },
};
