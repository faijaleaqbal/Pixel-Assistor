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

    if (target.id === message.guild.ownerId) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You cannot kick the server owner.')] });
    }
    if (target.id === message.author.id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You cannot kick yourself.')] });
    }
    if (target.id === message.client.user.id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I cannot kick myself.')] });
    }
    if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You cannot kick that member — they have an equal or higher role than you.')] });
    }
    if (!target.kickable) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I cannot kick that member — they have an equal or higher role than me.')] });
    }

    const reason = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await target.kick(`${reason} (by ${message.author.tag})`);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`👢 Kicked **${target.user.tag}** — ${reason}`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to kick: ${e.message}`)] });
    }
  },
};

