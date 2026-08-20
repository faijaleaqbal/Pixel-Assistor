// src/commands/utility/roleinfo.js
// Show detailed information about a role.
// Supports both @role mention and raw role ID.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { resolveRoleArg } = require('../../utils/resolveRole');

module.exports = {
  name: 'roleinfo',
  category: 'utility',
  description: 'Show details about a server role.',
  usage: '<@role|roleID>',
  aliases: ['ri', 'rli'],
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const role = await resolveRoleArg(message, args[0]);
    if (!role) return;

    const members = role.members.size;
    const perms = role.permissions.toArray();
    const permsList = perms.length > 10
      ? perms.slice(0, 10).map((p) => `\`${p}\``).join(', ') + ` ... +${perms.length - 10} more`
      : perms.length ? perms.map((p) => `\`${p}\``).join(', ') : 'No Key Permissions';

    const embed = new EmbedBuilder()
      .setColor(role.color || config.embedColor)
      .setTitle(`${role.name}`)
      .addFields(
        { name: 'Color', value: `${role.hexColor} ${role.color ? '[■](https://www.colorhexa.com/' + role.color.toString(16).padStart(6, '0') + ')' : ''}`, inline: true },
        { name: 'ID', value: role.id, inline: true },
        { name: 'Position', value: String(role.position), inline: true },
        { name: 'Members', value: String(members), inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
        { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R> (<t:${Math.floor(role.createdTimestamp / 1000)}:F>)`, inline: false },
        { name: 'Key Permissions', value: permsList, inline: false },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
