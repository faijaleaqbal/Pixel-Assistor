// src/commands/moderation/roleicon.js
// Set or clear a role's icon.

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'roleicon',
  category: 'moderation',
  aliases: ['rlc'],
  description: 'Set a role\'s icon from an emoji or attached image. Usage: roleicon <@role> <emoji|reset>',
  usage: '<@role> <emoji|reset>',
  cooldown: 3,
  permissions: ['ManageRoles'],
  args: true,
  async execute(message, args) {
    const role = message.mentions.roles.first();
    if (!role) return message.reply('Mention a role.');
    const arg = args.slice(1).join(' ').trim();
    if (arg === 'reset') {
      try {
        await role.setIcon(null);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`Cleared icon for ${role.name}.`)] });
      } catch (e) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to clear icon: **${e.message}**`)] });
      }
    }
    if (!arg && message.attachments.size) {
      const url = message.attachments.first().url;
      try {
        await role.setIcon(url);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`Set ${role.name}'s icon to the attached image.`)] });
      } catch (e) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to set icon: **${e.message}**`)] });
      }
    }
    if (!arg && !message.attachments.size) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide an emoji or attach an image, or use `reset`.')] });
    }
    try {
      await role.setIcon(arg);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`Set ${role.name}'s icon to ${arg}.`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to set icon: **${e.message}**`)] });
    }
  },
};
