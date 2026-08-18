// src/commands/moderation/ban.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { resolveUserArg } = require('../../utils/resolveUser');
const logger = require('../../utils/logger');

module.exports = {
  name: 'ban',
  category: 'moderation',
  description: 'Ban a member from the server. Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['BanMembers'],
  args: true,

  async execute(message, args) {
    const targetUser = await resolveUserArg(message, args[0]);
    if (!targetUser) return;

    // 1. Target validation
    if (targetUser.id === message.guild.ownerId) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You cannot ban the server owner.')] });
    }
    if (targetUser.id === message.author.id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You cannot ban yourself.')] });
    }
    if (targetUser.id === message.client.user.id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I cannot ban myself.')] });
    }

    // 2. Bot permissions check
    const botMember = message.guild.members.me || message.client.user;
    if (!message.guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I do not have permission to **Ban Members** in this server.')],
      });
    }

    // 3. Hierarchy checks
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (member) {
      if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= member.roles.highest.position) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You cannot ban that member — they have an equal or higher role than you.')] });
      }
      if (!member.bannable) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I cannot ban that member — their highest role is equal to or above my highest role.')] });
      }
    }

    const reason = args.slice(1).filter((a) => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await message.guild.bans.create(targetUser.id, { reason: `${reason} (by ${message.author.tag})` });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🔨 Banned **${targetUser.tag}** — ${reason}`)] });
    } catch (e) {
      logger.error('ban error', e?.stack || e?.message || e);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Failed to ban this user. Please check role hierarchy and permissions.')] });
    }
  },
};
