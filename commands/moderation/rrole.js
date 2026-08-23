// src/commands/moderation/rrole.js
// Remove role variants: single user, all humans, all bots. Batch of 20 with progress embed.

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
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
  async execute(message, args, client) {
    const action = args[0]?.toLowerCase();

    // Cancel pending batch
    if (action === 'cancel') {
      const key = `${message.guild.id}:${message.author.id}`;
      if (pendingBatches.get(key)) {
        pendingBatches.delete(key);
        return message.reply(opts(responseBuilder.buildResult({ description: '⏹️ Pending batch removal cancelled.'})));
      }
      return message.reply(opts(responseBuilder.buildResult({ description: 'No pending batch to cancel.'})));
    }

    const role = message.mentions.roles.first();
    if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role to remove.'})));
    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply(opts(responseBuilder.buildResult({ description: 'That role is too high in the hierarchy.'})));
    }

    // Single user — accept @mention OR raw user ID.
    if (action !== 'all' && action !== 'bots' && action !== 'humans') {
      const target = await resolveMemberArg(message, args[0]);
      if (!target) return;
      try {
        await target.roles.remove(role);
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Removed ${role} from ${target.user.tag}`})));
      } catch (err) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed: ${err.message}`})));
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
      return message.reply(opts(responseBuilder.buildResult({ description: `No ${label} have ${role}.`})));
    }
    const key = `${message.guild.id}:${message.author.id}`;
    const total = list.length;
    const msg = await message.reply(opts(responseBuilder.buildResult({ title: `Removing ${role.name}...`, description: `Progress: 0/${total}`})));
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
          await msg.edit(opts(responseBuilder.buildResult({ title: `Removing ${role.name}...`, description: `Progress: ${processed}/${total}`})));
        } catch { /* ignore edit fail */ }
      }
    }
    pendingBatches.delete(key);
    const cancelled = processed < total;
    try {
      return await msg.edit(opts(responseBuilder.buildResult({ title: cancelled ? `Cancelled` : `Done`, description: `${cancelled ? '⚠️' : '✅'} Removed ${role.name} from ${processed}/${total} member(s).`})));
    } catch { /* progress message deleted */ }
  },
};
