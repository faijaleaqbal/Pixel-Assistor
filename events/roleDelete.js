// src/events/roleDelete.js
// Anti-nuke: detects unauthorized role deletion and recreates it.

const { AuditLogEvent } = require('discord.js');
const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
const { buildContainer } = require('../utils/v2Reply');
const { fetchAuditEntry, sendLog, punish, isExempt, RED, ORANGE } = require('./antinukeHelpers');

module.exports = {
  name: 'roleDelete',

  async execute(role, client) {
    try {
      const guild = role.guild;
      const cfg = await getDb().antinuke.get(guild.id);
      if (!cfg || !cfg.enabled) return;

      const entry = await fetchAuditEntry(guild, AuditLogEvent.RoleDelete, role.id);
      if (!entry || !entry.executor) return;
      const user = entry.executor;

      if (await isExempt(user, guild, cfg, client)) return;

      // Log
      await sendLog(guild, cfg, client, buildContainer({
        emoji: '🛑',
        title: 'Role Deleted',
        description: `**${user.tag}** deleted role **${role.name}**`,
        fields: [
          { name: 'Color', value: role.hexColor },
          { name: 'Punishment', value: `\`${cfg.punishment}\`` },
        ],
        color: RED,
      }));

      // Undo: recreate role
      try {
        const newRole = await guild.roles.create({
          name: role.name,
          color: role.color,
          permissions: role.permissions,
          hoist: role.hoist,
          mentionable: role.mentionable,
        });

        await sendLog(guild, cfg, client, buildContainer({
          emoji: '🔄',
          title: 'Role Recreated',
          description: `Recreated as <@&${newRole.id}>`,
          color: ORANGE,
        }));
      } catch (createErr) {
        logger.warn(`roleDelete anti-nuke: failed to recreate role ${role.name}`, createErr.message);
        await sendLog(guild, cfg, client, buildContainer({
          emoji: '⚠️',
          title: 'Role Recreate Failed',
          description: `Could not recreate **${role.name}**: **${createErr.message}**`,
          color: RED,
        }));
      }

      await punish(guild, cfg, user);
    } catch (e) {
      logger.warn('roleDelete anti-nuke error', e.message);
    }
  },
};
