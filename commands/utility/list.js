const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/list.js
// Group: list commands or saved data.
//   ?list reminders  -> show your pending reminders
//   ?list upi        -> alias of ?listupi
//   ?list warns [@user] -> show a user's warns (mod only)
//   ?list admins/mods/bots/bans/boosters/emojis/botemojis/roles/inrole/activedeveloper/early/joinpos/createpos

const { PermissionsBitField } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');
const { hasPermission } = require('../../utils/perms');
const { resolveUserArg, resolveMemberArg } = require('../../utils/resolveUser');
const { opts } = require('../../utils/v2Reply');

const BT = String.fromCharCode(96);

module.exports = {
  name: 'list',
  category: 'utility',
  aliases: ['ls'],
  description: 'List various data.',
  usage: '<reminders|upi|warns|admins|mods|bots|bans|boosters|emojis|botemojis|roles|inrole|activedeveloper|early|joinpos|createpos>',
  cooldown: 3,
  async execute(message, args, client) {
    const sub = (args[0] || '').toLowerCase();

    // ── reminders ──
    if (sub === 'reminders') {
      const db = getDb();
      const mine = await db.userReminder.list(message.author.id);
      if (!mine || !mine.length) return message.reply(opts(responseBuilder.buildResult({ description: 'You have no reminders.'})));
      const fields = mine.slice(0, 10).map((r) => ({ name: '#' + String(r._id).slice(-6) + ' — <t:' + Math.floor(r.triggerAt / 1000) + ':R>', value: r.reason || '(no reason)', inline: false }));
      return message.reply(opts(responseBuilder.buildResult({ title: '\u23F0 Your reminders', fields: [fields]})));
    }

    // ── upi ──
    if (sub === 'upi') {
      const rows = await getDb().upi.list(message.author.id);
      if (!rows.length) return message.reply(opts(responseBuilder.buildResult({ description: 'No saved UPI IDs.'})));
      const fields = rows.map((r) => ({ name: r.label, value: BT + r.upiId + BT, inline: true }));
      return message.reply(opts(responseBuilder.buildResult({ title: '\uD83D\uDCB8 Your UPI IDs', fields: [fields]})));
    }

    // ── warns [@user|userID] ──
    if (sub === 'warns') {
      const target = args[1]
        ? (await resolveUserArg(message, args[1], { silent: true })) || message.author
        : message.author;
      if (target.id !== message.author.id && !hasPermission(message.member, 'ModerateMembers')) {
        return message.reply(opts(responseBuilder.buildResult({ description: "You need ModerateMembers to view others' warns."})));
      }
      const warns = await getDb().warn.list(target.id, message.guild.id);
      if (!warns.length) return message.reply(opts(responseBuilder.buildResult({ description: 'No warns on record.'})));
      const fields = warns.slice(0, 10).map((w) => ({ name: '#' + String(w._id).slice(-6) + ' — <t:' + Math.floor(w.at / 1000) + ':R>', value: w.reason || '(no reason)', inline: false }));
      return message.reply(opts(responseBuilder.buildResult({ title: '\u26A0\uFE0F Warns — ' + target.tag, fields: [fields]})), { allowedMentions: { parse: [] } });
    }

    // ── admins ──
    if (sub === 'admins') {
      const admins = message.guild.members.cache.filter(m => m.permissions.has(PermissionsBitField.Flags.Administrator) && !m.user.bot);
      if (!admins.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No admin members found.'})));
      const list = admins.map(m => '\u2022 ' + m.user.tag + ' (' + m.id + ')').join('\n');
      const embed = responseBuilder.buildResult({ title: '\uD83D\uDC51 Admins (' + admins.size + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── mods ──
    if (sub === 'mods') {
      const mods = message.guild.members.cache.filter(m => !m.user.bot && (
        m.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
        m.permissions.has(PermissionsBitField.Flags.ManageGuild)
      ));
      if (!mods.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No mod members found.'})));
      const list = mods.map(m => '\u2022 ' + m.user.tag + ' (' + m.id + ')').join('\n');
      const embed = responseBuilder.buildResult({ title: '\uD83D\uDEE1\uFE0F Mods (' + mods.size + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── bots ──
    if (sub === 'bots') {
      const bots = message.guild.members.cache.filter(m => m.user.bot);
      if (!bots.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No bots in this server.'})));
      const list = bots.map(m => '\u2022 ' + m.user.tag + ' (' + m.id + ')').join('\n');
      const embed = responseBuilder.buildResult({ title: '\uD83E\uDD16 Bots (' + bots.size + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── bans ──
    if (sub === 'bans') {
      if (!hasPermission(message.member, 'BanMembers')) {
        return message.reply(opts(responseBuilder.buildResult({ description: 'You need BanMembers permission.'})));
      }
      try {
        const bans = await message.guild.bans.fetch();
        if (!bans.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No bans in this server.'})));
        const shown = bans.first(20);
        const list = shown.map(b => '\u2022 ' + b.user.tag + ' (' + b.user.id + ') — ' + (b.reason || 'No reason')).join('\n');
        const extra = bans.size > 20 ? '\n...and ' + (bans.size - 20) + ' more.' : '';
        const embed = responseBuilder.buildResult({ title: '\uD83D\uDD12 Bans (' + bans.size + ')', description: list + extra});
        return message.reply(opts(embed));
      } catch {
        return message.reply(opts(responseBuilder.buildResult({ description: 'Failed to fetch bans.'})));
      }
    }

    // ── boosters ──
    if (sub === 'boosters') {
      const boosters = message.guild.members.cache.filter(m => m.premiumSince);
      if (!boosters.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No boosters in this server.'})));
      const list = boosters.map(m => '\u2022 ' + m.user.tag + ' — boosting since <t:' + Math.floor(m.premiumSinceTimestamp / 1000) + ':R>').join('\n');
      const embed = responseBuilder.buildResult({ title: '\uD83D\uDC8D Boosters (' + boosters.size + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── emojis ──
    if (sub === 'emojis') {
      const emojis = message.guild.emojis.cache;
      if (!emojis.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No emojis in this server.'})));
      const pages = [];
      let current = '';
      for (const [, e] of emojis) {
        const line = e.toString() + ' ' + BT + e.name + BT + (e.animated ? ' (animated)' : '') + '\n';
        if ((current + line).length > 1024) {
          pages.push(current);
          current = line;
        } else {
          current += line;
        }
      }
      if (current) pages.push(current);
      const embed = responseBuilder.buildResult({ title: '\uD83D\uDDF3\uFE0F Emojis (' + emojis.size + ')', description: pages[0] || 'None'});
      return message.reply(opts(embed));
    }

    // ── botemojis ──
    if (sub === 'botemojis') {
      const emojis = message.guild.emojis.cache;
      if (!emojis.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No custom emojis in this server.'})));
      let list = emojis.map(e => e.toString() + ' ' + BT + e.name + BT).join(' ');
      if (list.length > 1024) list = list.slice(0, 1020) + '...';
      const embed = responseBuilder.buildResult({ title: '\uD83E\uDD16 Bot Emojis (' + emojis.size + ')', description: list || 'None'});
      return message.reply(opts(embed));
    }

    // ── roles ──
    if (sub === 'roles') {
      const roles = message.guild.roles.cache.sort((a, b) => b.position - a.position);
      const list = roles.filter(r => r.id !== message.guild.id).map(r => '\u2022 ' + r.toString() + ' — ' + r.members.size + ' members').join('\n');
      if (!list) return message.reply(opts(responseBuilder.buildResult({ description: 'No roles found.'})));
      const embed = responseBuilder.buildResult({ title: '\uD83C\uDFF7\uFE0F Roles (' + (roles.size - 1) + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── inrole <@role> ──
    if (sub === 'inrole') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role.'})));
      const members = role.members;
      if (!members.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No members with ' + role.name + '.'})));
      const list = members.map(m => '\u2022 ' + m.user.tag).join('\n');
      const embed = responseBuilder.buildResult({ title: 'Members with ' + role.name + ' (' + members.size + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── activedeveloper ──
    if (sub === 'activedeveloper') {
      const devs = message.guild.members.cache.filter(m => m.user.flags && m.user.flags.has(1 << 17));
      if (!devs.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No active developers found.'})));
      const list = devs.map(m => '\u2022 ' + m.user.tag).join('\n');
      const embed = responseBuilder.buildResult({ title: '\uD83D\uDEE0\uFE0F Active Developers (' + devs.size + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── early ──
    if (sub === 'early') {
      const early = message.guild.members.cache.filter(m => m.user.flags && m.user.flags.has(1 << 1));
      if (!early.size) return message.reply(opts(responseBuilder.buildResult({ description: 'No early supporters found.'})));
      const list = early.map(m => '\u2022 ' + m.user.tag).join('\n');
      const embed = responseBuilder.buildResult({ title: '\u2B50 Early Supporters (' + early.size + ')', description: list.slice(0, 1024)});
      return message.reply(opts(embed));
    }

    // ── joinpos <@user|userID> ──
    if (sub === 'joinpos') {
      const target = args[1]
        ? (await resolveMemberArg(message, args[1], { silent: true })) || message.member
        : message.member;
      const sorted = [...message.guild.members.cache.values()].sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
      const pos = sorted.findIndex(m => m.id === target.id) + 1;
      if (!pos) return message.reply(opts(responseBuilder.buildResult({ description: 'Member not found.'})));
      const embed = responseBuilder.buildResult({ title: '\uD83D\uDCC5 Join Position \u2014 ' + target.user.tag, description: '**Position:** ' + pos + ' of ' + message.guild.memberCount + '\n**Joined:** <t:' + Math.floor(target.joinedTimestamp / 1000) + ':R>'});
      return message.reply(opts(embed), { allowedMentions: { parse: [] } });
    }

    // ── createpos ──
    if (sub === 'createpos') {
      const created = message.guild.createdAt;
      const embed = responseBuilder.buildResult({ title: '\uD83D\uDCC5 Server Creation \u2014 ' + message.guild.name, description: '**Created:** <t:' + Math.floor(created.getTime() / 1000) + ':F>\n**Age:** <t:' + Math.floor(created.getTime() / 1000) + ':R>'});
      return message.reply(opts(embed));
    }

    return message.reply(opts(responseBuilder.buildResult({ description: 'Usage: ' + BT + config.prefix + 'list <reminders|upi|warns|admins|mods|bots|bans|boosters|emojis|botemojis|roles|inrole|activedeveloper|early|joinpos|createpos>' + BT})));
  },
};
