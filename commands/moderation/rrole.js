// src/commands/moderation/rrole.js
// Remove role variants: single user, all humans, all bots. Batch of 20 with progress embed.

const { EmbedBuilder } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');

const pendingBatches = new Map();

module.exports = {
  name: 'rrole',
  category: 'moderation',
  description: 'Remove a role. Accepts @user or raw userID for single-user mode.',
  usage: '<@user|userID|all|bots|humans> <@role> | cancel',
  cooldown: 3,
  permissions: ['ManageRoles'],
  args: true,
  async execute(message, args) {
    const action = args[0]?.toLowerCase();

    // Cancel pending batch
    if (action === 'cancel') {
      const key = `${message.guild.id}:${message.author.id}`;
      if (pendingBatches.get(key)) {
        pendingBatches.delete(key);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('⏹️ Pending batch removal cancelled.')] });
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No pending batch to cancel.')] });
    }

    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role to remove.')] });
    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is too high in the hierarchy.')] });
    }

    // Single user — accept @mention OR raw user ID.
    if (action !== 'all' && action !== 'bots' && action !== 'humans') {
      const target = await resolveMemberArg(message, args[0]);
      if (!target) return;
      try {
        await target.roles.remove(role);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed ${role} from ${target.user.tag}`)] });
      } catch (err) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${err.message}`)] });
      }
    }

    // Batch mode
    await message.guild.members.fetch();
    let members;
    if (action === 'bots') members = message.guild.members.cache.filter(m => m.user.bot && m.roles.cache.has(role.id));
    else if (action === 'humans') members = message.guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(role.id));
    else members = message.guild.members.cache.filter(m => m.roles.cache.has(role.id));

    const list = members.map(m => m);
    if (!list.length) {
      const label = action === 'bots' ? 'bots' : action === 'humans' ? 'humans' : 'members';
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`No ${label} have ${role}.`)] });
    }
    const key = `${message.guild.id}:${message.author.id}`;
    const total = list.length;
    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Removing ${role.name}...`).setDescription(`Progress: 0/${total}`).setFooter({ text: 'Use ?rrole cancel to stop' })] });
    pendingBatches.set(key, true);

    let processed = 0;
    const batchSize = 20;
    for (let i = 0; i < list.length; i += batchSize) {
      if (!pendingBatches.get(key)) break;
      const batch = list.slice(i, i + batchSize);
      for (const member of batch) {
        try { await member.roles.remove(role); } catch { /* skip */ }
        processed++;
      }
      if (i + batchSize < list.length) {
        try {
          await msg.edit({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Removing ${role.name}...`).setDescription(`Progress: ${processed}/${total}`).setFooter({ text: 'Use ?rrole cancel to stop' })] });
        } catch { /* ignore edit fail */ }
      }
    }
    pendingBatches.delete(key);
    const cancelled = processed < total;
    try {
      return await msg.edit({ embeds: [new EmbedBuilder().setColor(cancelled ? 0xFEE75C : 0x57F287).setTitle(cancelled ? `Cancelled` : `Done`).setDescription(`${cancelled ? '⚠️' : '✅'} Removed ${role.name} from ${processed}/${total} member(s).`)] });
    } catch { /* progress message deleted */ }
  },
};
