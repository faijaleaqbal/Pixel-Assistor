// src/commands/moderation/persist.js
// Save up to 5 "sticky" roles on a member — they get re-applied on rejoin.

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'persist',
  category: 'moderation',
  aliases: ['pst'],
  description: 'Save up to 5 roles that will stick across leave/rejoin. Accepts @user or raw userID.',
  usage: '<@user|userID> <role1,role2,...>',
  cooldown: 3,
  permissions: ['ManageRoles'],
  args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    const roleInputs = args.slice(1).join(' ').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    if (!roleInputs.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide up to 5 roles (comma-separated).')] });

    const roleIds = [];
    for (const input of roleInputs) {
      const role = message.guild.roles.cache.find((r) => r.id === input || r.name.toLowerCase() === input.toLowerCase() || `<@&${r.id}>` === input);
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Role not found: ${input}`)] });
      roleIds.push(role.id);
      if (!target.roles.cache.has(role.id)) await target.roles.add(role).catch(() => {});
    }
    try {
      await getDb().persistRole.set(target.id, message.guild.id, roleIds);
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to persist roles: ${e.message}`)] });
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`Persisted ${roleIds.length} role(s) on ${target.user.tag}.`)] });
  },
};
