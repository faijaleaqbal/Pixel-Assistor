// src/commands/moderation/owner.js
// Configure server co-owner roles.
// SECURITY: Restricted strictly to the Guild Owner or Bot Owners.
// Usage: ?owner add <@role> | ?owner remove <@role> | ?owner list | ?owner clear

const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');
const { isOwner } = require('../../utils/perms');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'owner',
  category: 'moderation',
  description: 'Manage server co-owner roles. Only the Server Owner or Bot Owners can use this command.',
  usage: '<add|remove|list|clear> [@role]',
  cooldown: 3,
  permissions: ['Administrator'],

  async execute(message, args, client) {
    // Strict Owner Security Guard: Guild Owner or Bot Owner only!
    const isGuildOwner = message.guild.ownerId === message.author.id;
    const isBotOwner = isOwner(message.author.id);

    if (!isGuildOwner && !isBotOwner) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ Only the **Server Owner** can configure server co-owner roles.'})),
      );
    }

    const db = getDb();
    const gCfg = (await db.guildConfig.get(message.guild.id)) || {};
    const sub = (args[0] || '').toLowerCase();
    const ownerRoles = gCfg.ownerRoles || [];

    if (!sub || sub === 'list') {
      if (!ownerRoles.length) {
        return message.reply(opts(responseBuilder.buildResult({ description: 'No owner roles are configured.'})));
      }
      const roles = ownerRoles.map((id) => {
        const r = message.guild.roles.cache.get(id);
        return r ? `${r} (\`${id}\`)` : `\`${id}\` (deleted)`;
      });
      return message.reply(
        opts(responseBuilder.buildResult({ title: '👑 Owner Roles', description: roles.join('\n')})),
      );
    }

    if (sub === 'add') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) {
        return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide a role ID.'})));
      }
      if (ownerRoles.includes(role.id)) {
        return message.reply(opts(responseBuilder.buildResult({ description: `${role} is already an owner role.`})));
      }
      ownerRoles.push(role.id);
      await db.guildConfig.set(message.guild.id, { ownerRoles });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Added ${role} to owner roles.`})));
    }

    if (sub === 'remove') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) {
        return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide a role ID.'})));
      }
      const idx = ownerRoles.indexOf(role.id);
      if (idx === -1) {
        return message.reply(opts(responseBuilder.buildResult({ description: `${role} is not in the owner roles list.`})));
      }
      ownerRoles.splice(idx, 1);
      await db.guildConfig.set(message.guild.id, { ownerRoles });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Removed ${role} from owner roles.`})));
    }

    if (sub === 'clear') {
      await db.guildConfig.set(message.guild.id, { ownerRoles: [] });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Cleared all owner roles.'})));
    }

    return message.reply(opts(responseBuilder.buildResult({ description: 'Usage: `?owner <add|remove|list|clear> [@role]`'})));
  },
};
