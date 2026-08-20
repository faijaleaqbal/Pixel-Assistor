// src/commands/admin/ignore.js
// Manage ignored channels, users, commands, modules, and bypass entries.
// Requires Administrator permission.
// Usage:
//   ?ignore
//   ?ignore channel add|remove|show <#channel>
//   ?ignore user add|remove|show <@user>
//   ?ignore command add|remove|show <cmdName>
//   ?ignore module add|remove|show <moduleName>
//   ?ignore bypass channel add|remove|show <#channel>
//   ?ignore bypass user add|remove|show <@user>

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { resolveUserArg } = require('../../utils/resolveUser');

const E = (c, d) => new EmbedBuilder().setColor(c).setDescription(d);
const RED = 0xED4245, GREEN = 0x57F287, BLUE = 0x5865F2;

const TYPES = ['channel', 'user', 'command', 'module'];
const BYPASS_TYPES = { channel: 'bypass_channel', user: 'bypass_user' };

module.exports = {
  name: 'ignore',
  category: 'admin',
  description: 'Manage ignored channels, users, commands, modules, and bypass entries.',
  usage: '<channel|user|command|module|bypass> <add|remove|show> <target>',
  cooldown: 3,
  permissions: ['Administrator'],

  async execute(message, args) {
    const db = getDb();
    const gid = message.guild.id;

    // ── No args → summary ──
    if (!args.length) {
      const counts = {};
      for (const t of [...TYPES, 'bypass_channel', 'bypass_user']) {
        try { counts[t] = (await db.ignored.list(gid, t)).length; } catch { counts[t] = 0; }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Ignore Summary').setDescription(
        '**Channels:** ' + counts.channel + ' ignored\n' +
        '**Users:** ' + counts.user + ' ignored\n' +
        '**Commands:** ' + counts.command + ' ignored\n' +
        '**Modules:** ' + counts.module + ' ignored\n' +
        '**Bypass Channels:** ' + counts.bypass_channel + '\n' +
        '**Bypass Users:** ' + counts.bypass_user
      )] });
    }

    const sub = args[0].toLowerCase();

    // ── Bypass sub-group ──
    if (sub === 'bypass') {
      const bType = args[1]?.toLowerCase();
      if (!bType || !BYPASS_TYPES[bType]) return message.reply({ embeds: [E(RED, 'Bypass sub-types: `channel`, `user`.')] });
      return handleType(message, args.slice(2), gid, db, BYPASS_TYPES[bType], bType);
    }

    // ── Standard types ──
    if (!TYPES.includes(sub)) return message.reply({ embeds: [E(RED, 'Unknown type. Use `channel`, `user`, `command`, `module`, or `bypass`.')] });
    return handleType(message, args.slice(1), gid, db, sub, sub);
  },
};

// ── Shared handler for each type ──
async function handleType(message, args, gid, db, dbType, label) {
  const action = args[0]?.toLowerCase();

  if (action === 'show' || !action) {
    let items;
    try { items = await db.ignored.list(gid, dbType); } catch { items = []; }
    if (!items || !items.length) return message.reply({ embeds: [E(BLUE, 'No ignored **' + label + '** entries.')] });
    const lines = items.map((target, i) => (i + 1) + '. ' + target).join('\n');
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Ignored ' + label + 's (' + items.length + ')').setDescription(lines)] });
  }

  if (action === 'add') {
    let target;
    if (dbType === 'channel' || dbType === 'bypass_channel') {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply({ embeds: [E(RED, 'Mention a channel.')] });
      target = ch.id;
    } else if (dbType === 'user' || dbType === 'bypass_user') {
      const user = await resolveUserArg(message, args[1], { silent: true });
      if (!user) return message.reply({ embeds: [E(RED, 'Mention a user or paste their raw user ID.')] });
      target = user.id;
    } else {
      target = args[1]?.toLowerCase();
      if (!target) return message.reply({ embeds: [E(RED, 'Provide a name to ignore.')] });
    }
    await db.ignored.add(gid, dbType, target);
    return message.reply({ embeds: [E(GREEN, '✅ `' + target + '` added to ignored **' + label + '**.')] });
  }

  if (action === 'remove') {
    let target;
    if (dbType === 'channel' || dbType === 'bypass_channel') {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply({ embeds: [E(RED, 'Mention a channel.')] });
      target = ch.id;
    } else if (dbType === 'user' || dbType === 'bypass_user') {
      const user = await resolveUserArg(message, args[1], { silent: true });
      if (!user) return message.reply({ embeds: [E(RED, 'Mention a user or paste their raw user ID.')] });
      target = user.id;
    } else {
      target = args[1]?.toLowerCase();
      if (!target) return message.reply({ embeds: [E(RED, 'Provide a name to unignore.')] });
    }
    await db.ignored.remove(gid, dbType, target);
    return message.reply({ embeds: [E(GREEN, '✅ `' + target + '` removed from ignored **' + label + '**.')] });
  }

  return message.reply({ embeds: [E(RED, 'Sub-commands: `add`, `remove`, `show`.')] });
}
