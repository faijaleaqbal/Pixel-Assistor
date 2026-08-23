// src/commands/admin/autorole.js
// Set, remove, or view auto-roles for humans and bots.
// Usage:
//   ?autorole                      -> show current human auto-role
//   ?autorole set <@role>          -> set human auto-role
//   ?autorole remove               -> clear human auto-role
//   ?autorole bots add <@role>     -> set bot auto-role
//   ?autorole bots remove          -> clear bot auto-role
//   ?autorole bots                 -> show bot auto-role
//   ?autorole humans add <@role>   -> set human auto-role
//   ?autorole humans remove        -> clear human auto-role
//   ?autorole humans               -> show human auto-role
//   ?autorole config               -> show all settings
//   ?autorole reset [all|bots|humans] -> clear auto-roles

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');
const { canManageRole } = require('../../utils/perms');

module.exports = {
  name: 'autorole',
  aliases: ['ar'],
  category: 'admin',
  description: 'Set or remove auto-roles for humans and bots on member join.',
  usage: 'set <@role> | remove | bots add/remove | humans add/remove | config | reset [all|bots|humans]',
  cooldown: 3,
  permissions: ['ManageRoles'],

  async execute(message, args, client) {
    const db = getDb();
    const action = args[0]?.toLowerCase();

    // ── ?autorole config ──
    if (action === 'config') {
      const gCfg = await db.guildConfig.get(message.guild.id);
      const humanRole = gCfg?.autoRoleId ? message.guild.roles.cache.get(gCfg.autoRoleId) : null;
      const botRole = gCfg?.autoRoleBot ? message.guild.roles.cache.get(gCfg.autoRoleBot) : null;
      const embed = responseBuilder.buildResult({ title: '⚙️ Auto-Role Configuration', fields: [{ name: 'Humans', value: humanRole ? humanRole.toString() : 'Not set', inline: true },
          { name: 'Bots', value: botRole ? botRole.toString() : 'Not set', inline: true },]});
      return message.reply(opts(embed));
    }

    // ── ?autorole reset [all|bots|humans] ──
    if (action === 'reset') {
      const target = (args[1] || '').toLowerCase();
      if (target === 'bots') {
        await db.guildConfig.set(message.guild.id, { autoRoleBot: null });
        return message.reply(opts(responseBuilder.buildResult({ description: '✅ Bot auto-role cleared.'})));
      }
      if (target === 'humans') {
        await db.guildConfig.set(message.guild.id, { autoRoleId: null });
        return message.reply(opts(responseBuilder.buildResult({ description: '✅ Human auto-role cleared.'})));
      }
      await db.guildConfig.set(message.guild.id, { autoRoleId: null, autoRoleBot: null });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ All auto-roles cleared.'})));
    }

    // ── ?autorole bots ... ──
    if (action === 'bots') {
      const sub = (args[1] || '').toLowerCase();

      if (sub === 'add') {
        const input = args.slice(2).join(' ');
        const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === input.toLowerCase()) || message.guild.roles.cache.get(input);
        if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role, or provide its name/ID.'})));
        const check = canManageRole(message.member, role, message.guild, { actionName: 'configure as auto-role' });
        if (!check.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${check.error}`})));

        await db.guildConfig.set(message.guild.id, { autoRoleBot: role.id });
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Bot auto-role set to ${role}.`})));
      }

      if (sub === 'remove') {
        await db.guildConfig.set(message.guild.id, { autoRoleBot: null });
        return message.reply(opts(responseBuilder.buildResult({ description: '✅ Bot auto-role removed.'})));
      }

      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.autoRoleBot) return message.reply(opts(responseBuilder.buildResult({ description: 'No bot auto-role is configured.'})));
      const role = message.guild.roles.cache.get(gCfg.autoRoleBot);
      if (!role) {
        await db.guildConfig.set(message.guild.id, { autoRoleBot: null });
        return message.reply(opts(responseBuilder.buildResult({ description: 'The bot auto-role no longer exists. It has been cleared.'})));
      }
      return message.reply(opts(responseBuilder.buildResult({ title: '🤖 Bot Auto-Role', description: `Current bot auto-role: ${role}`})));
    }

    // ── ?autorole humans ... ──
    if (action === 'humans') {
      const sub = (args[1] || '').toLowerCase();

      if (sub === 'add') {
        const input = args.slice(2).join(' ');
        const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === input.toLowerCase()) || message.guild.roles.cache.get(input);
        if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role, or provide its name/ID.'})));
        const check = canManageRole(message.member, role, message.guild, { actionName: 'configure as auto-role' });
        if (!check.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${check.error}`})));

        await db.guildConfig.set(message.guild.id, { autoRoleId: role.id });
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Human auto-role set to ${role}.`})));
      }

      if (sub === 'remove') {
        await db.guildConfig.set(message.guild.id, { autoRoleId: null });
        return message.reply(opts(responseBuilder.buildResult({ description: '✅ Human auto-role removed.'})));
      }

      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.autoRoleId) return message.reply(opts(responseBuilder.buildResult({ description: 'No human auto-role is configured. Use `?autorole set <role>` to set one.'})));
      const role = message.guild.roles.cache.get(gCfg.autoRoleId);
      if (!role) {
        await db.guildConfig.set(message.guild.id, { autoRoleId: null });
        return message.reply(opts(responseBuilder.buildResult({ description: 'The human auto-role no longer exists. It has been cleared.'})));
      }
      return message.reply(opts(responseBuilder.buildResult({ title: '👤 Human Auto-Role', description: `Current human auto-role: ${role}`})));
    }

    // ── ?autorole set <@role> ──
    if (action === 'set') {
      const input = args.slice(1).join(' ');
      const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === input.toLowerCase()) || message.guild.roles.cache.get(input);
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role, or provide its name/ID.'})));
      const check = canManageRole(message.member, role, message.guild, { actionName: 'configure as auto-role' });
      if (!check.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${check.error}`})));

      await db.guildConfig.set(message.guild.id, { autoRoleId: role.id });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Auto-role set to ${role}. New members will receive it on join.`})));
    }

    // ── ?autorole remove/clear/off ──
    if (action === 'remove' || action === 'clear' || action === 'off') {
      await db.guildConfig.set(message.guild.id, { autoRoleId: null });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Auto-role has been removed.'})));
    }

    // ── ?autorole (no args) ──
    const gCfg = await db.guildConfig.get(message.guild.id);
    if (!gCfg?.autoRoleId) return message.reply(opts(responseBuilder.buildResult({ description: 'No auto-role is configured. Use `?autorole set <role>` to set one.'})));
    const role = message.guild.roles.cache.get(gCfg.autoRoleId);
    if (!role) {
      await db.guildConfig.set(message.guild.id, { autoRoleId: null });
      return message.reply(opts(responseBuilder.buildResult({ description: 'The previously set auto-role no longer exists. It has been cleared.'})));
    }
    return message.reply(opts(responseBuilder.buildResult({ title: 'Auto-Role', description: `Current auto-role: ${role}`})));
  },
};
