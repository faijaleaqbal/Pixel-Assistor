// src/commands/moderation/admin.js
// Admin role management.

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');

function parseRoles(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

module.exports = {
  name: 'admin',
  category: 'moderation',
  description: 'Manage admin roles. Usage: admin add <@role> | remove <@role> | reset | role | show',
  usage: 'add <@role> | remove <@role> | reset | role | show',
  cooldown: 3,
  permissions: ['Administrator'],
  async execute(message, args, client) {
    const db = getDb();
    const action = args[0]?.toLowerCase();
    const guildId = message.guild.id;
    let cfg = await db.guildConfig.get(guildId);
    let roles = parseRoles(cfg?.adminRoles || '[]');

    // Show
    if (action === 'show' || action === 'list' || !action) {
      if (!roles.length) return message.reply(opts(responseBuilder.buildResult({ description: 'No admin roles configured.'})));
      const list = roles.map(id => {
        const r = message.guild.roles.cache.get(id);
        return r ? r.toString() + ' `' + id + '`' : '`' + id + '` (not found)';
      }).join('\n') || 'None found';
      return message.reply(opts(responseBuilder.buildResult({ title: 'Admin Roles', description: list})));
    }

    // Role
    if (action === 'role') {
      if (!roles.length) return message.reply(opts(responseBuilder.buildResult({ description: 'No admin role set.'})));
      const r = message.guild.roles.cache.get(roles[0]);
      return message.reply(opts(responseBuilder.buildResult({ description: 'Current admin role: ' + (r ? r.toString() : '`' + roles[0] + '` (not found)')})));
    }

    // Reset
    if (action === 'reset') {
      await db.guildConfig.set(guildId, { adminRoles: [] });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Admin roles cleared.'})));
    }

    // Add
    if (action === 'add') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply(opts(buildContainer({ description: 'Mention a role to add.' })));
      if (roles.includes(role.id)) return message.reply(opts(responseBuilder.buildResult({ description: 'That role is already an admin role.'})));
      roles.push(role.id);
      await db.guildConfig.set(guildId, { adminRoles: roles });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Added ' + role.toString() + ' as an admin role.'})));
    }

    // Remove
    if (action === 'remove' || action === 'del') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply(opts(buildContainer({ description: 'Mention a role to remove.' })));
      roles = roles.filter(id => id !== role.id);
      await db.guildConfig.set(guildId, { adminRoles: roles });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Removed ' + role.toString() + ' from admin roles.'})));
    }

    return message.reply(opts(buildContainer({ description: 'Usage: `admin add <@role> | remove <@role> | reset | role | show`' })));
  },
};
