// src/commands/admin/antinuke.js
// Production Anti-Nuke protection configuration.
// Restricted strictly to Server Owners and Trusted Owners.

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');
const { isTrustedOwner } = require('../../utils/perms');
const { resolveUserArg } = require('../../utils/resolveUser');
const { getPrefix } = require('../../utils/prefixCache');

const E = (c, d) => responseBuilder.buildResult({ description: d });
const RED = 0xED4245, GREEN = 0x57F287, BLUE = 0x5865F2, YELLOW = 0xFEE75C;

module.exports = {
  name: 'antinuke',
  aliases: ['an', 'antinuke-config'],
  category: 'admin',
  description: 'Configure server anti-nuke protection against unauthorized mass actions.',
  usage: '<enable|disable|setup|status|logging|punishment|owner|whitelist|wlrole|reset> [args]',
  cooldown: 3,
  ownerOnly: true,

  async execute(message, args, client) {
    const isAuth = await isTrustedOwner(message.author.id, message.guild);
    if (!isAuth) {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: 'Access Denied',
          description: "❌ You don't have permission to use this command. This command is restricted to Server Owners & Trusted Owners.",
        }))
      );
    }

    const prefix = await getPrefix(message.guild?.id);
    const db = getDb();
    const gid = message.guild.id;
    let cfg = (await db.antinuke.get(gid)) || {
      enabled: false,
      logChannel: null,
      punishment: 'ban',
      owners: [],
      whitelist: [],
      wlRoles: [],
    };

    const sub = (args[0] || '').toLowerCase();

    // ── Brief Overview / Help (no args) ──
    if (!sub) {
      const on = cfg.enabled ? '**ENABLED** 🛡️' : '**DISABLED** ❌';
      return message.reply(
        opts(responseBuilder.buildResult({
          title: '🛡️ Anti-Nuke Security Overview',
          description: `**Status:** ${on}\n` +
            `**Punishment:** \`${cfg.punishment || 'ban'}\`\n` +
            `**Log Channel:** ${cfg.logChannel ? `<#${cfg.logChannel}>` : '`None`'}\n` +
            `**Exempt Owners:** \`${cfg.owners.length}\` | **Whitelisted Users:** \`${cfg.whitelist.length}\` | **Whitelisted Roles:** \`${cfg.wlRoles.length}\`\n\n` +
            `**Subcommands:**\n` +
            `• \`${prefix}antinuke enable\` / \`disable\` — Toggle anti-nuke system\n` +
            `• \`${prefix}antinuke status\` — Detailed security configuration\n` +
            `• \`${prefix}antinuke logging <#channel>\` — Set security log channel\n` +
            `• \`${prefix}antinuke punishment <ban|kick|strip>\` — Configure punishment type\n` +
            `• \`${prefix}antinuke whitelist <add|remove|show|reset> [@user]\` — Manage whitelisted users\n` +
            `• \`${prefix}antinuke wlrole <add|remove|list|reset> [@role]\` — Manage whitelisted roles\n` +
            `• \`${prefix}antinuke setup\` — Quick 1-click automatic setup`,
        }))
      );
    }

    // ── Enable ──
    if (sub === 'enable' || sub === 'on') {
      cfg.enabled = true;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, '✅ Anti-nuke security module is now **ENABLED**.')));
    }

    // ── Disable ──
    if (sub === 'disable' || sub === 'off') {
      cfg.enabled = false;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, '✅ Anti-nuke security module is now **DISABLED**.')));
    }

    // ── Setup (1-click quick configuration) ──
    if (sub === 'setup') {
      cfg.enabled = true;
      cfg.logChannel = message.channel.id;
      if (!cfg.owners.includes(message.author.id)) cfg.owners.push(message.author.id);
      await db.antinuke.set(gid, cfg);
      return message.reply(
        opts(E(GREEN, `✅ Anti-nuke **ENABLED**.\n• Log channel set to <#${message.channel.id}>.\n• <@${message.author.id}> added as protected security owner.`))
      );
    }

    // ── Detailed Status / Config ──
    if (sub === 'status' || sub === 'config' || sub === 'show' || sub === 'info') {
      const logCh = cfg.logChannel ? `<#${cfg.logChannel}>` : '`Not Configured`';
      const ownerList = cfg.owners.length
        ? cfg.owners.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')
        : '`None (Server Owner automatically exempt)`';
      const wlList = cfg.whitelist.length
        ? cfg.whitelist.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n')
        : '`No whitelisted users`';
      const wlRoleList = cfg.wlRoles.length
        ? cfg.wlRoles.map((id, i) => `${i + 1}. <@&${id}> (\`${id}\`)`).join('\n')
        : '`No whitelisted roles`';

      return message.reply(
        opts(responseBuilder.buildResult({
          title: '🛡️ Anti-Nuke — Full Security Settings',
          fields: [
            { name: 'System Status', value: cfg.enabled ? '✅ Active' : '❌ Inactive', inline: true },
            { name: 'Punishment', value: `\`${cfg.punishment || 'ban'}\``, inline: true },
            { name: 'Audit Log Channel', value: logCh, inline: true },
            { name: `Module Owners (${cfg.owners.length})`, value: ownerList, inline: false },
            { name: `Whitelisted Users (${cfg.whitelist.length})`, value: wlList, inline: false },
            { name: `Whitelisted Roles (${cfg.wlRoles.length})`, value: wlRoleList, inline: false },
          ],
        }))
      );
    }

    // ── Logging Channel ──
    if (sub === 'logging' || sub === 'log' || sub === 'channel') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply(opts(E(RED, 'Mention a channel or provide a valid channel ID.')));
      cfg.logChannel = ch.id;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, `✅ Anti-nuke audit log channel set to ${ch}.`)));
    }

    // ── Punishment ──
    if (sub === 'punishment' || sub === 'action') {
      const type = (args[1] || '').toLowerCase();
      if (!['ban', 'kick', 'strip'].includes(type)) {
        return message.reply(
          opts(E(RED, `Invalid punishment type \`${args[1]}\`. Valid options: \`ban\`, \`kick\`, \`strip\`.`))
        );
      }
      cfg.punishment = type;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, `✅ Anti-nuke punishment type set to \`${type}\`.`)));
    }

    // ── Owner sub-commands ──
    if (sub === 'owner' || sub === 'owners') {
      const action = (args[1] || '').toLowerCase();

      if (!action || action === 'list' || action === 'show') {
        if (!cfg.owners.length) return message.reply(opts(E(BLUE, 'No extra module owners configured.')));
        return message.reply(
          opts(responseBuilder.buildResult({
            title: `🛡️ Anti-Nuke Owners (${cfg.owners.length})`,
            description: cfg.owners.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n'),
          }))
        );
      }

      if (action === 'add') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        if (cfg.owners.includes(user.id)) return message.reply(opts(E(YELLOW, `<@${user.id}> is already a module owner.`)));
        cfg.owners.push(user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ <@${user.id}> has been added as an anti-nuke owner.`)));
      }

      if (action === 'remove' || action === 'del') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        cfg.owners = cfg.owners.filter((id) => id !== user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ <@${user.id}> has been removed from anti-nuke owners.`)));
      }

      if (action === 'reset' || action === 'clear') {
        cfg.owners = [];
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, '✅ All anti-nuke module owners have been cleared.')));
      }

      return message.reply(opts(E(RED, 'Usage: `antinuke owner <add|remove|list|reset> [@user]`')));
    }

    // ── Whitelist sub-commands ──
    if (sub === 'whitelist' || sub === 'wl') {
      const action = (args[1] || '').toLowerCase();

      if (!action || action === 'show' || action === 'list') {
        if (!cfg.whitelist.length) return message.reply(opts(E(BLUE, 'No whitelisted users configured.')));
        return message.reply(
          opts(responseBuilder.buildResult({
            title: `🛡️ Anti-Nuke Whitelisted Users (${cfg.whitelist.length})`,
            description: cfg.whitelist.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join('\n'),
          }))
        );
      }

      if (action === 'add') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        if (cfg.whitelist.includes(user.id)) return message.reply(opts(E(YELLOW, `<@${user.id}> is already whitelisted.`)));
        cfg.whitelist.push(user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ <@${user.id}> has been added to the anti-nuke whitelist.`)));
      }

      if (action === 'remove' || action === 'del') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        cfg.whitelist = cfg.whitelist.filter((id) => id !== user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ <@${user.id}> has been removed from the anti-nuke whitelist.`)));
      }

      if (action === 'reset' || action === 'clear') {
        cfg.whitelist = [];
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, '✅ All whitelisted users have been cleared.')));
      }

      return message.reply(opts(E(RED, 'Usage: `antinuke whitelist <add|remove|show|reset> [@user]`')));
    }

    // ── WL Role sub-commands ──
    if (sub === 'wlrole' || sub === 'whitelistedrole' || sub === 'role') {
      const action = (args[1] || '').toLowerCase();

      if (!action || action === 'list' || action === 'show') {
        if (!cfg.wlRoles.length) return message.reply(opts(E(BLUE, 'No whitelisted roles configured.')));
        return message.reply(
          opts(responseBuilder.buildResult({
            title: `🛡️ Anti-Nuke Whitelisted Roles (${cfg.wlRoles.length})`,
            description: cfg.wlRoles.map((id, i) => `${i + 1}. <@&${id}> (\`${id}\`)`).join('\n'),
          }))
        );
      }

      if (action === 'add') {
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]);
        if (!role) return message.reply(opts(E(RED, 'Mention a role or provide a role ID.')));
        if (cfg.wlRoles.includes(role.id)) return message.reply(opts(E(YELLOW, `${role} is already whitelisted.`)));
        cfg.wlRoles.push(role.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${role} has been added to whitelisted roles.`)));
      }

      if (action === 'remove' || action === 'del') {
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]);
        if (!role) return message.reply(opts(E(RED, 'Mention a role or provide a role ID.')));
        cfg.wlRoles = cfg.wlRoles.filter((id) => id !== role.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${role} has been removed from whitelisted roles.`)));
      }

      if (action === 'reset' || action === 'clear') {
        cfg.wlRoles = [];
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, '✅ All whitelisted roles have been cleared.')));
      }

      return message.reply(opts(E(RED, 'Usage: `antinuke wlrole <add|remove|list|reset> [@role]`')));
    }

    // ── Reset / Clear entire module ──
    if (sub === 'reset' || sub === 'clear') {
      await db.antinuke.set(gid, {
        enabled: false,
        logChannel: null,
        punishment: 'ban',
        owners: [],
        whitelist: [],
        wlRoles: [],
      });
      return message.reply(opts(E(GREEN, '✅ Anti-nuke settings have been reset to factory defaults.')));
    }

    return message.reply(
      opts(E(RED, `Unknown subcommand: \`${sub}\`.\nUse \`${prefix}antinuke\` to view all subcommands.`))
    );
  },
};
