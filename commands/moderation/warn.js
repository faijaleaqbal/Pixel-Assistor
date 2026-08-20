// src/commands/moderation/warn.js
const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { hasPermission, canManageMember } = require('../../utils/perms');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'warn',
  category: 'moderation',
  description: 'Warn a member or manage warnings. Accepts @user or raw userID.',
  usage: '<@user|userID> [reason] | add|list|remove|clear|clearall',
  cooldown: 3,
  permissions: ['ModerateMembers'],
  async execute(message, args) {
    const db = getDb();
    const sub = (args[0] || '').toLowerCase();

    // ?warn list <@user|userID>
    if (sub === 'list') {
      const target = await resolveMemberArg(message, args[1]);
      if (!target) return;
      const rows = await db.warn.list(target.id, message.guild.id);
      if (!rows.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`${target.user.tag} has no warnings.`)] });
      const fields = rows.slice(0, 15).map((r, i) => ({
        name: `#${i + 1} — <t:${Math.floor(r.at / 1000)}:R>`,
        value: `${r.reason || '(no reason)'} *(by <@${r.moderatorId}>)*`,
        inline: false,
      }));
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`⚠️ Warnings for ${target.user.tag} (${rows.length})`).addFields(fields)] });
    }

    // ?warn remove <id>
    if (sub === 'remove') {
      const id = parseInt(args[1], 10);
      if (!id) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a warning ID. Use `?warn list <@user|userID>` to see IDs.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('Individual warning removal is not supported yet. Use `?clearwarns <@user|userID>` to clear all warnings for a user.')] });
    }

    // ?warn clear <@user|userID>
    if (sub === 'clear') {
      const target = await resolveMemberArg(message, args[1]);
      if (!target) return;
      const check = canManageMember(message.member, target, message.guild, { actionName: 'manage warnings for' });
      if (!check.ok) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${check.error}`)] });
      const count = await db.warn.clear(target.id, message.guild.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Cleared ${count} warning(s) for ${target.user.tag}.`)] });
    }

    // ?warn clearall
    if (sub === 'clearall') {
      if (!hasPermission(message.member, 'Administrator')) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Only administrators can clear all server warnings.')] });
      }
      try {
        const total = await db.warn.clearGuild(message.guild.id);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Cleared ${total} warning(s) across all members.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to clear guild warnings.')] });
      }
    }

    // ?warn <@user|userID> [reason]   OR   ?warn add <@user|userID> [reason]
    const targetIndex = sub === 'add' ? 1 : 0;
    const target = await resolveMemberArg(message, args[targetIndex]);
    if (!target) return;

    if (target.user.bot) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ You cannot warn a bot.')] });
    }

    const check = canManageMember(message.member, target, message.guild, { actionName: 'warn' });
    if (!check.ok) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${check.error}`)] });
    }

    const reasonStart = targetIndex + 1;
    const reason = args.slice(reasonStart).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided.';
    await db.warn.add(target.id, message.guild.id, message.author.id, reason, Date.now());
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`⚠️ ${target.user.tag} has been warned.\n**Reason:** ${reason}`)] });
  },
};
