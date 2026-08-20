const responseBuilder = require('../../utils/responseBuilder');
// src/commands/moderation/kick.js
const { PermissionsBitField } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');
const logger = require('../../utils/logger');

module.exports = {
  name: 'kick',
  category: 'moderation',
  description: 'Kick a member from the server. Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['KickMembers'],
  args: true,

  async execute(message, args, client) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;

    // 1. Target validation
    if (target.id === message.guild.ownerId) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ You cannot kick the server owner.'})] });
    }
    if (target.id === message.author.id) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ You cannot kick yourself.'})] });
    }
    if (target.id === message.client.user.id) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ I cannot kick myself.'})] });
    }

    // 2. Bot permissions check
    if (!message.guild.members.me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply({
        embeds: [responseBuilder.buildResult({ description: '❌ I do not have permission to **Kick Members** in this server.'})],
      });
    }

    // 3. Hierarchy checks
    if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ You cannot kick that member — they have an equal or higher role than you.'})] });
    }
    if (!target.kickable) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ I cannot kick that member — their highest role is equal to or above my highest role.'})] });
    }

    const reason = args.slice(1).filter((a) => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await target.kick(`${reason} (by ${message.author.tag})`);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `👢 Kicked **${target.user.tag}** — ${reason}`})] });
    } catch (e) {
      logger.error('kick error', e?.stack || e?.message || e);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '❌ Failed to kick this user. Please check role hierarchy and permissions.'})] });
    }
  },
};
