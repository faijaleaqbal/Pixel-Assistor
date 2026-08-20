// src/commands/utility/whois.js
// ?whois <@user|userID> — Look up any Discord user's info, even if they've left the server.
// Unlike ?userinfo (which requires guild membership), ?whois works for ANY Discord user.

const responseBuilder = require('../../utils/responseBuilder');
const { resolveUserArg } = require('../../utils/resolveUser');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'whois',
  aliases: ['wi'],
  category: 'utility',
  description: 'Look up any Discord user\'s info, even if they\'ve left the server.',
  usage: '<@user|userID>',
  cooldown: 3,
  args: true,
  async execute(message, args, client) {
    // Resolve user via shared utility (mention OR raw ID)
    const target = await resolveUserArg(message, args[0]);
    if (!target) return; // error already replied by resolveUserArg

    // Try fetching guild member (expected to fail if they left / were never here)
    const member = await message.guild.members.fetch(target.id).catch(() => null);

    const e = responseBuilder.buildResult({ title: `@${target.username}\'s User Information`, thumbnail: target.displayAvatarURL({ size: 512 })});

    // ── General ──
    e.addFields(
      { name: 'ID', value: target.id, inline: true },
      { name: 'Username', value: target.username, inline: true },
      { name: 'Display Name', value: target.globalName || target.displayName || target.username, inline: true },
      { name: 'Mention', value: `<@${target.id}>`, inline: true },
    );

    // ── Created At (always available) ──
    e.addFields({
      name: 'Created At',
      value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R> (<t:${Math.floor(target.createdTimestamp / 1000)}:F>)`,
      inline: false,
    });

    // ── Joined At — ONLY if a current member ──
    if (member) {
      e.addFields({
        name: 'Joined At',
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R> (<t:${Math.floor(member.joinedTimestamp / 1000)}:F>)`,
        inline: false,
      });
    } else {
      e.addFields({ name: 'Joined At', value: 'Not currently a member of this server', inline: false });
    }

    // ── Roles — ONLY if a member ──
    if (member) {
      const roles = member.roles.cache
        .filter((r) => r.id !== message.guild.id)
        .map((r) => `<@&${r.id}>`)
        .slice(0, 15)
        .join(', ') || '—';
      e.addFields({ name: `Roles [${member.roles.cache.size - 1}]`, value: roles, inline: false });
    }

    // ── Latest Activity — ONLY if a member with tracked data ──
    if (member) {
      try {
        const db = getDb();
        const reaction = (await db.reactionStat.get(target.id, message.guild.id)).wins || 0;
        const warns = (await db.warn.list(target.id, message.guild.id)).length;
        e.addFields({
          name: 'Latest Activity',
          value: `Reaction Wins: **${reaction}** | Warns: **${warns}**`,
          inline: false,
        });
      } catch {
        e.addFields({ name: 'Latest Activity', value: 'No activity data available.', inline: false });
      }
    } else {
      e.addFields({ name: 'Latest Activity', value: 'No activity data — user is not in this server.', inline: false });
    }

    // ── Key Permissions — ONLY if a member ──
    if (member) {
      const keyPerms = [
        'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels',
        'KickMembers', 'BanMembers', 'ManageMessages', 'MuteMembers',
        'DeafenMembers', 'MoveMembers', 'ModerateMembers',
      ];
      const has = keyPerms.filter((p) => member.permissions.has(p));
      e.addFields({
        name: 'Key Permissions',
        value: has.length ? has.map((p) => `\`${p}\``).join(', ') : 'No Key Permissions',
        inline: false,
      });
    }

    e.setFooter({ text: `Requested by @${message.author.tag} • ${new Date().toLocaleString()}` });
    e.setTimestamp();

    return message.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};
