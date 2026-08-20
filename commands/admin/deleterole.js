// src/commands/admin/deleterole.js
const { EmbedBuilder } = require('discord.js');
const { canManageRole } = require('../../utils/perms');

module.exports = {
  name: 'deleterole',
  aliases: ['dr'],
  category: 'admin',
  description: 'Delete a role by name, mention, or ID.',
  usage: '<role>',
  cooldown: 5,
  permissions: ['ManageRoles'],
  args: true,
  async execute(message, args) {
    const input = args.join(' ');
    if (!input) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a role name, mention, or ID.')] });

    const role = message.guild.roles.cache.find(r => r.id === input || r.name.toLowerCase() === input.toLowerCase() || `<@&${r.id}>` === input);
    if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Role not found.')] });

    const check = canManageRole(message.member, role, message.guild, { actionName: 'delete' });
    if (!check.ok) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${check.error}`)] });
    }

    try {
      await role.delete(`Deleted by ${message.author.tag}`);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Role **${role.name}** deleted.`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${e.message}`)] });
    }
  },
};
