// src/commands/moderation/mod.js
// Mod role management.

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

module.exports = {
  name: 'mod',
  category: 'moderation',
  description: 'Manage mod roles. Usage: mod add <@role> | remove <@role> | reset | role | setup <@role> | show',
  usage: 'add <@role> | remove <@role> | reset | role | setup <@role> | show',
  cooldown: 3,
  permissions: ['Administrator'],
  async execute(message, args) {
    const db = getDb();
    const action = args[0]?.toLowerCase();
    const guildId = message.guild.id;
    let cfg = await db.guildConfig.get(guildId);
    let roles = parseRoles(cfg?.modRoles || '[]');

    // Show
    if (action === 'show' || action === 'list' || !action) {
      if (!roles.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No mod roles configured.')] });
      const list = roles.map(id => {
        const r = message.guild.roles.cache.get(id);
        return r ? r.toString() + ' `' + id + '`' : '`' + id + '` (not found)';
      }).join('\n') || 'None found';
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Mod Roles').setDescription(list)] });
    }

    // Role (alias for show)
    if (action === 'role') {
      if (!roles.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No mod role set.')] });
      const r = message.guild.roles.cache.get(roles[0]);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('Current mod role: ' + (r ? r.toString() : '`' + roles[0] + '` (not found)'))] });
    }

    // Reset
    if (action === 'reset') {
      await db.guildConfig.set(guildId, { modRoles: [] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Mod roles cleared.')] });
    }

    // Add
    if (action === 'add') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply('Mention a role to add.');
      if (roles.includes(role.id)) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('That role is already a mod role.')] });
      roles.push(role.id);
      await db.guildConfig.set(guildId, { modRoles: roles });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Added ' + role.toString() + ' as a mod role.')] });
    }

    // Setup (set single + clear others)
    if (action === 'setup') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply('Mention a role to set as mod role.');
      await db.guildConfig.set(guildId, { modRoles: [role.id] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Mod role set to ' + role.toString() + '.')] });
    }

    // Remove
    if (action === 'remove' || action === 'del') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply('Mention a role to remove.');
      roles = roles.filter(id => id !== role.id);
      await db.guildConfig.set(guildId, { modRoles: roles });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Removed ' + role.toString() + ' from mod roles.')] });
    }

    return message.reply('Usage: `mod add <@role> | remove <@role> | reset | role | setup <@role> | show`');
  },
};
