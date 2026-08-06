// src/commands/moderation/give.js

const { EmbedBuilder } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'give',
  category: 'moderation',
  description: 'Give a role to a user. Accepts @user or raw userID.',
  usage: '<@user|userID> <@role>',
  cooldown: 3,
  permissions: ['ManageRoles'],
  args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role to give.')] });
    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is too high in the hierarchy.')] });
    }
    try {
      await target.roles.add(role);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Gave ${role} to ${target.user.tag}`)] });
    } catch (err) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${err.message}`)] });
    }
  },
};
