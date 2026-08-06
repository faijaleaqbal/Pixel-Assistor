// src/events/roleDelete.js
// Anti-nuke: detects unauthorized role deletion and recreates it.

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
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
      await sendLog(guild, cfg, client, new EmbedBuilder().setColor(RED)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setTitle('🛑 Role Deleted')
        .setDescription(`**${user.tag}** deleted role **${role.name}**`)
        .addFields(
          { name: 'Color', value: role.hexColor, inline: true },
          { name: 'Punishment', value: `\`${cfg.punishment}\``, inline: true },
        ).setTimestamp());

      // Undo: recreate role
      try {
        const newRole = await guild.roles.create({
          name: role.name,
          color: role.color,
          permissions: role.permissions,
          hoist: role.hoist,
          mentionable: role.mentionable,
        });

        await sendLog(guild, cfg, client, new EmbedBuilder().setColor(ORANGE)
          .setTitle('🔄 Role Recreated')
          .setDescription(`Recreated as <@&${newRole.id}>`));
      } catch (createErr) {
        logger.warn(`roleDelete anti-nuke: failed to recreate role ${role.name}`, createErr.message);
        await sendLog(guild, cfg, client, new EmbedBuilder().setColor(RED)
          .setTitle('⚠️ Role Recreate Failed')
          .setDescription(`Could not recreate **${role.name}**: **${createErr.message}**`));
      }

      await punish(guild, cfg, user);
    } catch (e) {
      logger.warn('roleDelete anti-nuke error', e.message);
    }
  },
};
