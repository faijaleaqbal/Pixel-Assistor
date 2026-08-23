// src/commands/moderation/role.js
// Toggle roles on a member, or batch-assign roles.
// Supports: <@user|userID> <role1,role2,...> | all|bots|humans|create|delete|rename|temp|cancel|status

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const ms = require('../../utils/ms');
const { resolveMemberArg } = require('../../utils/resolveUser');
const { canManageRole, canManageMember } = require('../../utils/perms');

const DURATION_RE = ms.DURATION_RE;

function parseDuration(str) {
  const v = ms.parse(str);
  return v > 0 ? v : null;
}

function resolveRole(message, input) {
  if (!input) return null;
  return (
    message.mentions.roles.first() ||
    message.guild.roles.cache.find(
      (r) => r.id === input || r.name.toLowerCase() === input.toLowerCase() || `<@&${r.id}>` === input
    )
  );
}

// Track active batch operations: guildId -> { collector, message, role, type }
const activeBatches = new Map();

module.exports = {
  name: 'role',
  category: 'moderation',
  aliases: ['rl'],
  description: 'Toggle roles on members or batch-assign roles. Accepts @user or raw userID.',
  usage: '<@user|userID> <role1,role2,...> | all|bots|humans|create|delete|rename|temp|cancel|status',
  cooldown: 3,
  permissions: ['ManageRoles'],
  args: true,
  async execute(message, args, client) {
    const sub = (args[0] || '').toLowerCase();

    // ── ?role all <@role> ──
    if (sub === 'all') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide its name/ID.'})));
      const roleCheck = canManageRole(message.member, role, message.guild, { actionName: 'assign' });
      if (!roleCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${roleCheck.error}`})));

      try { await message.guild.members.fetch(); } catch { /* ignore */ }
      const humans = message.guild.members.cache.filter(m => !m.user.bot && !m.roles.cache.has(role.id));
      if (!humans.size) return message.reply(opts(responseBuilder.buildResult({ description: 'All human members already have this role.'})));

      const confirm = await message.reply(opts(responseBuilder.buildResult({ description: `Add ${role} to **${humans.size}** human members? Type \`yes\` to confirm.`})));
      const filter = (m) => m.author.id === message.author.id && m.content.toLowerCase() === 'yes';
      const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });
      activeBatches.set(message.guild.id, { collector, message: confirm, role, type: 'all' });

      collector.on('collect', async () => {
        let count = 0;
        for (const [, m] of humans) {
          try { await m.roles.add(role); count++; } catch { /* skip */ }
        }
        await confirm.edit(opts(responseBuilder.buildResult({ description: `✅ Added ${role} to ${count} member(s).`})));
        activeBatches.delete(message.guild.id);
      });
      collector.on('end', (collected, reason) => {
        if (reason === 'time' && !collected.size) {
          confirm.edit(opts(responseBuilder.buildResult({ description: 'Timed out.'}))).catch(() => {});
          activeBatches.delete(message.guild.id);
        }
      });
      return;
    }

    // ── ?role bots <@role> ──
    if (sub === 'bots') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide its name/ID.'})));
      const roleCheck = canManageRole(message.member, role, message.guild, { actionName: 'assign' });
      if (!roleCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${roleCheck.error}`})));

      try { await message.guild.members.fetch(); } catch { /* ignore */ }
      const bots = message.guild.members.cache.filter(m => m.user.bot && !m.roles.cache.has(role.id));
      if (!bots.size) return message.reply(opts(responseBuilder.buildResult({ description: 'All bots already have this role.'})));

      let count = 0;
      for (const [, m] of bots) {
        try { await m.roles.add(role); count++; } catch { /* skip */ }
      }
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Added ${role} to ${count} bot(s).`})));
    }

    // ── ?role humans <@role> ──
    if (sub === 'humans') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide its name/ID.'})));
      const roleCheck = canManageRole(message.member, role, message.guild, { actionName: 'assign' });
      if (!roleCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${roleCheck.error}`})));

      try { await message.guild.members.fetch(); } catch { /* ignore */ }
      const humans = message.guild.members.cache.filter(m => !m.user.bot && !m.roles.cache.has(role.id));
      if (!humans.size) return message.reply(opts(responseBuilder.buildResult({ description: 'All humans already have this role.'})));

      let count = 0;
      for (const [, m] of humans) {
        try { await m.roles.add(role); count++; } catch { /* skip */ }
      }
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Added ${role} to ${count} member(s).`})));
    }

    // ── ?role create <name> [color] ──
    if (sub === 'create') {
      const name = args.slice(1).find(a => !a.match(/^#[0-9a-f]{6}$/i));
      const colorInput = args.slice(1).find(a => a.match(/^#[0-9a-f]{6}$/i));
      if (!name) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a role name.'})));
      const options = { name, reason: `Created by ${message.author.tag} via ?role create` };
      if (colorInput) options.color = colorInput;
      try {
        const role = await message.guild.roles.create(options);
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Role ${role} created.`})));
      } catch (e) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed to create role: ${e.message}`})));
      }
    }

    // ── ?role delete <@role> ──
    if (sub === 'delete') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide its name/ID.'})));
      const roleCheck = canManageRole(message.member, role, message.guild, { actionName: 'delete' });
      if (!roleCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${roleCheck.error}`})));
      try {
        await role.delete(`Deleted by ${message.author.tag} via ?role delete`);
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Role \`${role.name}\` deleted.`})));
      } catch (e) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed to delete role: ${e.message}`})));
      }
    }

    // ── ?role rename <@role> <newname> ──
    if (sub === 'rename') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide its name/ID.'})));
      const newName = args.slice(2).join(' ');
      if (!newName) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a new name.'})));
      const roleCheck = canManageRole(message.member, role, message.guild, { actionName: 'rename' });
      if (!roleCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${roleCheck.error}`})));
      try {
        await role.setName(newName, `Renamed by ${message.author.tag} via ?role rename`);
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Role renamed to ${role}.`})));
      } catch (e) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed to rename role: ${e.message}`})));
      }
    }

    // ── ?role temp <@user|userID> <@role> <duration> ──
    if (sub === 'temp') {
      const target = await resolveMemberArg(message, args[1]);
      if (!target) return;
      const targetCheck = canManageMember(message.member, target, message.guild, { actionName: 'modify roles on' });
      if (!targetCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${targetCheck.error}`})));

      const role = resolveRole(message, args[2]);
      if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a role or provide its name/ID.'})));
      const roleCheck = canManageRole(message.member, role, message.guild, { actionName: 'temporarily assign' });
      if (!roleCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${roleCheck.error}`})));

      const durationStr = args.find(a => DURATION_RE.test(a));
      if (!durationStr) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a duration (e.g. 10m, 1h, 1d).'})));
      const durMs = parseDuration(durationStr);
      if (!durMs) return message.reply(opts(responseBuilder.buildResult({ description: 'Invalid duration format.'})));
      if (durMs > 7 * 86400000) return message.reply(opts(responseBuilder.buildResult({ description: 'Maximum duration is 7 days.'})));

      try {
        await target.roles.add(role, `Temporary role added by ${message.author.tag} for ${durationStr}`);
        const tempHandle = setTimeout(async () => {
          try { await target.roles.remove(role, 'Temporary role expired'); } catch { /* role may have been removed */ }
        }, durMs);
        if (typeof tempHandle.unref === 'function') tempHandle.unref();
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Added ${role} to ${target.user.tag} for \`${durationStr}\`.`})));
      } catch (e) {
        return message.reply(opts(responseBuilder.buildResult({ description: `Failed to add role: ${e.message}`})));
      }
    }

    // ── ?role cancel ──
    if (sub === 'cancel') {
      const batch = activeBatches.get(message.guild.id);
      if (!batch) return message.reply(opts(responseBuilder.buildResult({ description: 'No active batch operation.'})));
      batch.collector.stop('cancelled');
      batch.message.edit(opts(responseBuilder.buildResult({ description: 'Batch operation cancelled.'}))).catch(() => {});
      activeBatches.delete(message.guild.id);
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Batch cancelled.'})));
    }

    // ── ?role status ──
    if (sub === 'status') {
      const batch = activeBatches.get(message.guild.id);
      if (!batch) return message.reply(opts(responseBuilder.buildResult({ description: 'No active batch operation.'})));
      return message.reply(opts(responseBuilder.buildResult({ title: 'Active Batch Operation', description: `**Type:** ${batch.type}\n**Role:** ${batch.role}`})));
    }

    // ── Original single-user toggle behavior ──
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    const targetCheck = canManageMember(message.member, target, message.guild, { actionName: 'modify roles on' });
    if (!targetCheck.ok) return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${targetCheck.error}`})));

    const raw = args.slice(1).join(' ');
    const roleInputs = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    if (!roleInputs.length) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide up to 5 roles (comma-separated).'})));

    const results = [];
    for (const input of roleInputs) {
      const role = message.guild.roles.cache.find(
        (r) => r.id === input || r.name.toLowerCase() === input.toLowerCase() || `<@&${r.id}>` === input
      );
      if (!role) { results.push(`❌ \`${input}\` — not found`); continue; }
      const roleCheck = canManageRole(message.member, role, message.guild, { actionName: 'toggle' });
      if (!roleCheck.ok) {
        results.push(`❌ \`${role.name}\` — ${roleCheck.error}`);
        continue;
      }
      const has = target.roles.cache.has(role.id);
      if (has) {
        try { await target.roles.remove(role, `Toggled off by ${message.author.tag}`); results.push(`➖ ${role.name}`); }
        catch { results.push(`❌ ${role.name} — failed to remove`); }
      } else {
        try { await target.roles.add(role, `Toggled on by ${message.author.tag}`); results.push(`➕ ${role.name}`); }
        catch { results.push(`❌ ${role.name} — failed to add`); }
      }
    }
    return message.reply(opts(responseBuilder.buildResult({ title: 'Roles updated', description: results.join('\n')})));
  },
};
