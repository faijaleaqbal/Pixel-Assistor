// src/commands/admin/antinuke.js
// Anti-nuke protection configuration.
// Server owner or bot owner only.
// Usage:
//   ?antinuke
//   ?antinuke enable | disable | setup | status
//   ?antinuke logging <#channel>
//   ?antinuke punishment <ban|kick|strip>
//   ?antinuke owner [add|remove|list|reset] [@user]
//   ?antinuke whitelist [add|remove|show|reset] [@user]
//   ?antinuke wlrole [add|remove|list|reset] [@role]

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');
const { isTrustedOwner } = require('../../utils/perms');
const { resolveUserArg } = require('../../utils/resolveUser');

const E = (c, d) => responseBuilder.buildResult({ description: d});
const RED = 0xED4245, GREEN = 0x57F287, BLUE = 0x5865F2, YELLOW = 0xFEE75C;

module.exports = {
  name: 'antinuke',
  aliases: ['an', 'antinuke-config'],
  category: 'admin',
  description: 'Configure anti-nuke protection for the server.',
  usage: '<enable|disable|setup|status|logging|punishment|owner|whitelist|wlrole> [args]',
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

    const db = getDb();
    const gid = message.guild.id;
    let cfg = (await db.antinuke.get(gid)) || { enabled: false, logChannel: null, punishment: 'ban', owners: [], whitelist: [], wlRoles: [] };

    // ── No args → brief status ──
    if (!args.length) {
      const on = cfg.enabled ? '**ON** ✅' : '**OFF** ❌';
      return message.reply(opts(responseBuilder.buildResult({ title: 'Anti-Nuke Status', description: `Enabled: ${on}\nPunishment: \`${cfg.punishment}\`\nOwners: ${cfg.owners.length}\nWhitelisted users: ${cfg.whitelist.length}\nWhitelisted roles: ${cfg.wlRoles.length}`})));
    }

    const sub = args[0].toLowerCase();

    // ── Enable ──
    if (sub === 'enable' || sub === 'on') {
      cfg.enabled = true;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, '✅ Anti-nuke is now **enabled**.')));
    }

    // ── Disable ──
    if (sub === 'disable' || sub === 'off') {
      cfg.enabled = false;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, '✅ Anti-nuke is now **disabled**.')));
    }

    // ── Setup (one-command quick config) ──
    if (sub === 'setup') {
      cfg.enabled = true;
      cfg.logChannel = message.channel.id;
      if (!cfg.owners.includes(message.author.id)) cfg.owners.push(message.author.id);
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, '✅ Anti-nuke **enabled**. Log channel set to this channel. You have been added as an owner.')));
    }

    // ── Status (full detailed) ──
    if (sub === 'status') {
      const logCh = cfg.logChannel ? `<#${cfg.logChannel}>` : '`None`';
      const ownerList = cfg.owners.length ? cfg.owners.map((id, i) => `${i + 1}. <@${id}>`).join('\n') : '`None`';
      const wlList = cfg.whitelist.length ? cfg.whitelist.map((id, i) => `${i + 1}. <@${id}>`).join('\n') : '`None`';
      const wlRoleList = cfg.wlRoles.length ? cfg.wlRoles.map((id, i) => `${i + 1}. <@&${id}>`).join('\n') : '`None`';
      return message.reply(opts(responseBuilder.buildResult({ title: 'Anti-Nuke — Full Configuration', fields: [{ name: 'Enabled', value: cfg.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Punishment', value: `\`${cfg.punishment}\``, inline: true },
          { name: 'Log Channel', value: logCh, inline: true },
          { name: `Owners (${cfg.owners.length})`, value: ownerList, inline: false },
          { name: `Whitelisted Users (${cfg.whitelist.length})`, value: wlList, inline: false },
          { name: `Whitelisted Roles (${cfg.wlRoles.length})`, value: wlRoleList, inline: false },]})));
    }

    // ── Logging ──
    if (sub === 'logging') {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply(opts(E(RED, 'Mention a channel to set as the log channel.')));
      cfg.logChannel = ch.id;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, `✅ Log channel set to ${ch}.`)));
    }

    // ── Punishment ──
    if (sub === 'punishment') {
      const type = args[1]?.toLowerCase();
      if (!['ban', 'kick', 'strip'].includes(type)) return message.reply(opts(E(RED, 'Punishment must be `ban`, `kick`, or `strip`.')));
      cfg.punishment = type;
      await db.antinuke.set(gid, cfg);
      return message.reply(opts(E(GREEN, `✅ Punishment set to \`${type}\`.`)));
    }

    // ── Owner sub-commands ──
    if (sub === 'owner') {
      const action = args[1]?.toLowerCase();

      // ?antinuke owner  (no action) → list
      if (!action || action === 'list') {
        if (!cfg.owners.length) return message.reply(opts(E(BLUE, 'No owners configured. Use `?antinuke owner add @user`.')));
        return message.reply(opts(responseBuilder.buildResult({ title: `Owners (${cfg.owners.length})`, description: cfg.owners.map((id, i) => `${i + 1}. <@${id}>`).join('\n')})));
      }

      if (action === 'add') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        if (cfg.owners.includes(user.id)) return message.reply(opts(E(YELLOW, `${user.username} is already an owner.`)));
        cfg.owners.push(user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${user.username} has been added as an owner.`)));
      }

      if (action === 'remove') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        cfg.owners = cfg.owners.filter(id => id !== user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${user.username} has been removed from owners.`)));
      }

      if (action === 'reset') {
        cfg.owners = [];
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, '✅ All owners have been cleared.')));
      }

      return message.reply(opts(E(RED, 'Owner sub-commands: `add`, `remove`, `list`, `reset`.')));
    }

    // ── Whitelist sub-commands ──
    if (sub === 'whitelist') {
      const action = args[1]?.toLowerCase();

      if (!action || action === 'show') {
        if (!cfg.whitelist.length) return message.reply(opts(E(BLUE, 'No whitelisted users. Use `?antinuke whitelist add @user`.')));
        return message.reply(opts(responseBuilder.buildResult({ title: `Whitelisted Users (${cfg.whitelist.length})`, description: cfg.whitelist.map((id, i) => `${i + 1}. <@${id}>`).join('\n')})));
      }

      if (action === 'add') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        if (cfg.whitelist.includes(user.id)) return message.reply(opts(E(YELLOW, `${user.username} is already whitelisted.`)));
        cfg.whitelist.push(user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${user.username} has been whitelisted.`)));
      }

      if (action === 'remove') {
        const user = await resolveUserArg(message, args[2]);
        if (!user) return;
        cfg.whitelist = cfg.whitelist.filter(id => id !== user.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${user.username} has been removed from the whitelist.`)));
      }

      if (action === 'reset') {
        cfg.whitelist = [];
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, '✅ All whitelisted users have been cleared.')));
      }

      return message.reply(opts(E(RED, 'Whitelist sub-commands: `add`, `remove`, `show`, `reset`.')));
    }

    // ── WL Role sub-commands ──
    if (sub === 'wlrole') {
      const action = args[1]?.toLowerCase();

      if (!action || action === 'list') {
        if (!cfg.wlRoles.length) return message.reply(opts(E(BLUE, 'No whitelisted roles. Use `?antinuke wlrole add @role`.')));
        return message.reply(opts(responseBuilder.buildResult({ title: `Whitelisted Roles (${cfg.wlRoles.length})`, description: cfg.wlRoles.map((id, i) => `${i + 1}. <@&${id}>`).join('\n')})));
      }

      if (action === 'add') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply(opts(E(RED, 'Mention a role to whitelist.')));
        if (cfg.wlRoles.includes(role.id)) return message.reply(opts(E(YELLOW, `${role} is already whitelisted.`)));
        cfg.wlRoles.push(role.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${role} has been whitelisted.`)));
      }

      if (action === 'remove') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply(opts(E(RED, 'Mention a role to remove from the whitelist.')));
        cfg.wlRoles = cfg.wlRoles.filter(id => id !== role.id);
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, `✅ ${role} has been removed from the whitelist.`)));
      }

      if (action === 'reset') {
        cfg.wlRoles = [];
        await db.antinuke.set(gid, cfg);
        return message.reply(opts(E(GREEN, '✅ All whitelisted roles have been cleared.')));
      }

      return message.reply(opts(E(RED, 'WL Role sub-commands: `add`, `remove`, `list`, `reset`.')));
    }

    return message.reply(opts(E(RED, 'Unknown sub-command. See `?help antinuke`.')));
  },
};
