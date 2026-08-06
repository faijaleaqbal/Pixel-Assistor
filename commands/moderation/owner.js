// src/commands/moderation/owner.js
// Server co-owner role management.

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

module.exports = {
  name: 'owner',
  category: 'moderation',
  description: 'Manage co-owner roles. Usage: owner add <@role> | remove <@role> | reset | show',
  usage: 'add <@role> | remove <@role> | reset | show',
  cooldown: 3,
  permissions: ['Administrator'],
  async execute(message, args) {
    const db = getDb();
    const action = args[0]?.toLowerCase();
    const guildId = message.guild.id;
    let cfg = await db.guildConfig.get(guildId);
    let roles = parseRoles(cfg?.ownerRoles || '[]');

    // Show
    if (action === 'show' || action === 'list' || !action) {
      if (!roles.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No co-owner roles configured.')] });
      const list = roles.map(id => {
        const r = message.guild.roles.cache.get(id);
        return r ? r.toString() + ' `' + id + '`' : '`' + id + '` (not found)';
      }).join('\n') || 'None found';
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Co-Owner Roles').setDescription(list)] });
    }

    // Reset
    if (action === 'reset') {
      await db.guildConfig.set(guildId, { ownerRoles: [] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Co-owner roles cleared.')] });
    }

    // Add
    if (action === 'add') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply('Mention a role to add.');
      if (roles.includes(role.id)) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('That role is already a co-owner role.')] });
      roles.push(role.id);
      await db.guildConfig.set(guildId, { ownerRoles: roles });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Added ' + role.toString() + ' as a co-owner role.')] });
    }

    // Remove
    if (action === 'remove' || action === 'del') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply('Mention a role to remove.');
      roles = roles.filter(id => id !== role.id);
      await db.guildConfig.set(guildId, { ownerRoles: roles });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Removed ' + role.toString() + ' from co-owner roles.')] });
    }

    return message.reply('Usage: `owner add <@role> | remove <@role> | reset | show`');
  },
};
