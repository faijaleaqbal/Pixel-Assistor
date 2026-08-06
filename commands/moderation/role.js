// src/commands/moderation/role.js
// Toggle roles on a member, or batch-assign roles.
// Supports: <@user|userID> <role1,role2,...> | all|bots|humans|create|delete|rename|temp|cancel|status

const { EmbedBuilder } = require('discord.js');
const ms = require('../../utils/ms');
const { resolveMemberArg } = require('../../utils/resolveUser');

// Single shared duration regex — same as utils/ms.js. Delegates parsing to ms.parse.
const DURATION_RE = ms.DURATION_RE;

function parseDuration(str) {
  const v = ms.parse(str);
  return v > 0 ? v : null;
}

function resolveRole(message, input) {
  return message.mentions.roles.first() || message.guild.roles.cache.find(r => r.id === input || r.name.toLowerCase() === input.toLowerCase());
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
  async execute(message, args) {
    const sub = (args[0] || '').toLowerCase();

    // ── ?role all <@role> ──
    if (sub === 'all') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role or provide its name/ID.')] });
      if (role.position >= message.guild.members.me.roles.highest.position) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is above my highest role.')] });

      // Fetch ALL members so we don't miss uncached / inactive ones.
      try { await message.guild.members.fetch(); } catch { /* ignore — proceed with cache */ }
      const humans = message.guild.members.cache.filter(m => !m.user.bot && !m.roles.cache.has(role.id));
      if (!humans.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('All human members already have this role.')] });

      const confirm = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`Add ${role} to **${humans.size}** human members? Type \`yes\` to confirm.`)] });
      const filter = (m) => m.author.id === message.author.id && m.content.toLowerCase() === 'yes';
      const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });
      activeBatches.set(message.guild.id, { collector, message: confirm, role, type: 'all' });

      collector.on('collect', async () => {
        let count = 0;
        for (const [, m] of humans) {
          try { await m.roles.add(role); count++; } catch { /* skip */ }
        }
        await confirm.edit({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\u2705 Added ${role} to ${count} member(s).`)] });
        activeBatches.delete(message.guild.id);
      });
      collector.on('end', (collected, reason) => {
        if (reason === 'time' && !collected.size) {
          confirm.edit({ embeds: [new EmbedBuilder().setColor(0x99AAB5).setDescription('Timed out.')] }).catch(() => {});
          activeBatches.delete(message.guild.id);
        }
      });
      return;
    }

    // ── ?role bots <@role> ──
    if (sub === 'bots') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role or provide its name/ID.')] });
      if (role.position >= message.guild.members.me.roles.highest.position) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is above my highest role.')] });

      try { await message.guild.members.fetch(); } catch { /* ignore */ }
      const bots = message.guild.members.cache.filter(m => m.user.bot && !m.roles.cache.has(role.id));
      if (!bots.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('All bots already have this role.')] });

      let count = 0;
      for (const [, m] of bots) {
        try { await m.roles.add(role); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\u2705 Added ${role} to ${count} bot(s).`)] });
    }

    // ── ?role humans <@role> ── (same as all)
    if (sub === 'humans') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role or provide its name/ID.')] });
      if (role.position >= message.guild.members.me.roles.highest.position) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is above my highest role.')] });

      try { await message.guild.members.fetch(); } catch { /* ignore */ }
      const humans = message.guild.members.cache.filter(m => !m.user.bot && !m.roles.cache.has(role.id));
      if (!humans.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('All humans already have this role.')] });

      let count = 0;
      for (const [, m] of humans) {
        try { await m.roles.add(role); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\u2705 Added ${role} to ${count} member(s).`)] });
    }

    // ── ?role create <name> [color] ──
    if (sub === 'create') {
      const name = args.slice(1).find(a => !a.match(/^#[0-9a-f]{6}$/i));
      const colorInput = args.slice(1).find(a => a.match(/^#[0-9a-f]{6}$/i));
      if (!name) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a role name.')] });
      const options = { name, reason: 'Created via ?role create' };
      if (colorInput) options.color = colorInput;
      try {
        const role = await message.guild.roles.create(options);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\u2705 Role ${role} created.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to create role.')] });
      }
    }

    // ── ?role delete <@role> ──
    if (sub === 'delete') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role or provide its name/ID.')] });
      if (role.position >= message.guild.members.me.roles.highest.position) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is above my highest role.')] });
      try {
        await role.delete('Deleted via ?role delete');
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\u2705 Role \`${role.name}\` deleted.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to delete role.')] });
      }
    }

    // ── ?role rename <@role> <newname> ──
    if (sub === 'rename') {
      const role = resolveRole(message, args[1]);
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role or provide its name/ID.')] });
      const newName = args.slice(2).join(' ');
      if (!newName) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a new name.')] });
      if (role.position >= message.guild.members.me.roles.highest.position) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is above my highest role.')] });
      try {
        await role.setName(newName, 'Renamed via ?role rename');
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\u2705 Role renamed to ${role}.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to rename role.')] });
      }
    }

    // ── ?role temp <@user|userID> <@role> <duration> ──
    if (sub === 'temp') {
      const target = await resolveMemberArg(message, args[1]);
      if (!target) return;
      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role.')] });
      if (role.position >= message.guild.members.me.roles.highest.position) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That role is above my highest role.')] });
      const durationStr = args.find(a => DURATION_RE.test(a));
      if (!durationStr) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a duration (e.g. 10m, 1h, 1d).')] });
      const durMs = parseDuration(durationStr);
      if (!durMs) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Invalid duration format.')] });
      if (durMs > 7 * 86400000) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Maximum duration is 7 days.')] });
      try {
        await target.roles.add(role);
        const tempHandle = setTimeout(async () => {
          try { await target.roles.remove(role); } catch { /* role may have been removed */ }
        }, durMs);
        if (typeof tempHandle.unref === 'function') tempHandle.unref();
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\u2705 Added ${role} to ${target.user.tag} for \`${durationStr}\`.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to add role.')] });
      }
    }

    // ── ?role cancel ──
    if (sub === 'cancel') {
      const batch = activeBatches.get(message.guild.id);
      if (!batch) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No active batch operation.')] });
      batch.collector.stop('cancelled');
      batch.message.edit({ embeds: [new EmbedBuilder().setColor(0x99AAB5).setDescription('Batch operation cancelled.')] }).catch(() => {});
      activeBatches.delete(message.guild.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('\u2705 Batch cancelled.')] });
    }

    // ── ?role status ──
    if (sub === 'status') {
      const batch = activeBatches.get(message.guild.id);
      if (!batch) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No active batch operation.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Active Batch Operation').setDescription(`**Type:** ${batch.type}\n**Role:** ${batch.role}`)] });
    }

    // ── Original single-user toggle behavior ──
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    const raw = args.slice(1).join(' ');
    const roleInputs = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    if (!roleInputs.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide up to 5 roles (comma-separated).')] });

    const results = [];
    for (const input of roleInputs) {
      const role = message.guild.roles.cache.find(
        (r) => r.id === input || r.name.toLowerCase() === input.toLowerCase() || `<@&${r.id}>` === input
      );
      if (!role) { results.push(`\u274C ${input} — not found`); continue; }
      if (role.position >= message.guild.members.me.roles.highest.position) {
        results.push(`\u274C ${role.name} — too high in hierarchy`);
        continue;
      }
      const has = target.roles.cache.has(role.id);
      if (has) {
        try { await target.roles.remove(role); results.push(`\u2796 ${role.name}`); }
        catch { results.push(`\u274C ${role.name} — failed to remove`); }
      } else {
        try { await target.roles.add(role); results.push(`\u2795 ${role.name}`); }
        catch { results.push(`\u274C ${role.name} — failed to add`); }
      }
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Roles updated').setDescription(results.join('\n'))] });
  },
};
