// src/commands/admin/whitelist.js
// Command whitelist — lets listed users run bot commands WITHOUT the prefix.
// Server owner or bot owner only.
// Usage:
//   ?whitelist me              — add YOURSELF to WL (shortcut)
//   ?whitelist me remove        — remove YOURSELF from WL
//   ?whitelist add <@user|userID>      — add someone
//   ?whitelist remove <@user|userID>   — remove someone
//   ?whitelist list            — show WL
//   ?whitelist clear            — clear all

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { isOwner } = require('../../utils/perms');
const { resolveMemberArg } = require('../../utils/resolveUser');

const E = (c, d) => new EmbedBuilder().setColor(c).setDescription(d);

function isAuth(msg) {
  return msg.guild.ownerId === msg.author.id || isOwner(msg.author.id);
}

module.exports = {
  name: 'whitelist',
  aliases: ['wl'],
  category: 'admin',
  description: 'Let specific users use bot commands without the prefix. Accepts @user or raw userID.',
  usage: '<me|add|remove|list|clear> [@user|userID]',
  cooldown: 3,
  // No permissions gate — the in-execute isAuth() check authorizes either the
  // server owner OR the bot owner. A blanket `permissions: ['Administrator']`
  // would block the bot owner if they don't have Administrator in the guild.
  ownerOnly: false,
  args: true,

  async execute(message, args) {
    if (!isAuth(message)) {
      return message.reply({ embeds: [E(0xED4245, 'Only the **server owner** or **bot owner** can manage the command whitelist.')] });
    }

    const sub = (args[0] || '').toLowerCase();
    const db = getDb();

    // ── me (self-add) ──
    if (sub === 'me' || sub === 'self') {
      const action = (args[1] || '').toLowerCase();

      // ?wl me remove → remove yourself
      if (action === 'remove' || action === 'rm' || action === 'del') {
        const ok = await db.cmdWhitelist.remove(message.author.id, message.guild.id);
        if (!ok) return message.reply({ embeds: [E(0xFEE75C, 'You are not in the command whitelist.')] });
        return message.reply({ embeds: [E(0x57F287, `✅ You removed yourself from the command whitelist. You now need the prefix to use commands.`)] });
      }

      // ?wl me → add yourself
      if (message.author.bot) return message.reply({ embeds: [E(0xED4245, 'Bots cannot be whitelisted.')] });

      const ok = await db.cmdWhitelist.add(message.author.id, message.guild.id, message.author.id);
      if (!ok) return message.reply({ embeds: [E(0xFEE75C, 'You are already in the command whitelist. ✅')] });

      return message.reply({ embeds: [E(0x57F287, `✅ You added yourself to the command whitelist. You can now use **all commands without the prefix**.`)] });
    }

    // ── add ──
    if (sub === 'add') {
      const target = await resolveMemberArg(message, args[1]);
      if (!target) return;

      // Don't allow adding bots
      if (target.user.bot) return message.reply({ embeds: [E(0xED4245, 'You cannot add bots to the command whitelist.')] });

      const ok = await db.cmdWhitelist.add(target.id, message.guild.id, message.author.id);
      if (!ok) return message.reply({ embeds: [E(0xFEE75C, `<@${target.id}> is already in the command whitelist.`)] });

      return message.reply({ embeds: [E(0x57F287, `✅ <@${target.id}> added to the command whitelist. They can now use **all commands without the prefix**.`)] });
    }

    // ── remove ──
    if (sub === 'remove') {
      const target = await resolveMemberArg(message, args[1]);
      if (!target) return;

      const ok = await db.cmdWhitelist.remove(target.id, message.guild.id);
      if (!ok) return message.reply({ embeds: [E(0xFEE75C, `<@${target.id}> is not in the command whitelist.`)] });

      return message.reply({ embeds: [E(0x57F287, `✅ <@${target.id}> removed from the command whitelist. They now need the prefix to use commands.`)] });
    }

    // ── list ──
    if (sub === 'list' || sub === 'show') {
      const rows = await db.cmdWhitelist.list(message.guild.id);
      if (!rows.length) return message.reply({ embeds: [E(0xFEE75C, 'The command whitelist is empty.')] });

      const list = rows.map((r, i) => {
        const tag = message.guild.members.cache.get(r.userId)?.user?.tag || `\`${r.userId}\``;
        const addedBy = message.guild.members.cache.get(r.addedBy)?.user?.tag || `\`${r.addedBy}\``;
        return `**${i + 1}.** ${tag} — added by ${addedBy} (<t:${Math.floor(r.addedAt / 1000)}:R>)`;
      });

      // Discord field limit is 1024 — split if needed
      const CHUNK = 10;
      const embeds = [];
      for (let i = 0; i < list.length; i += CHUNK) {
        embeds.push(new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📋 Command Whitelist${list.length > CHUNK ? ` (${Math.floor(i / CHUNK) + 1}/${Math.ceil(list.length / CHUNK)})` : ''}`)
          .setDescription(list.slice(i, i + CHUNK).join('\n'))
          .setFooter({ text: `${rows.length} user${rows.length > 1 ? 's' : ''} whitelisted — can use commands without prefix` })
          .setTimestamp());
      }
      return message.reply({ embeds });
    }

    // ── clear ──
    if (sub === 'clear' || sub === 'reset') {
      const count = await db.cmdWhitelist.clear(message.guild.id);
      if (!count) return message.reply({ embeds: [E(0xFEE75C, 'The command whitelist is already empty.')] });
      return message.reply({ embeds: [E(0x57F287, `✅ Command whitelist cleared. **${count}** user${count > 1 ? 's' : ''} removed.`)] });
    }

    // Unknown subcommand
    return message.reply({ embeds: [E(0xED4245, 'Unknown sub-command. Use `me`, `add`, `remove`, `list`, or `clear`.')] });
  },
};
