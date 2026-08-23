// src/events/guildBanAdd.js
// Anti-nuke: detects unauthorized bans and unbans the target + punishes executor.

const { AuditLogEvent } = require('discord.js');
const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
const { buildContainer } = require('../utils/v2Reply');
const { fetchAuditEntry, sendLog, punish, isExempt, RED, ORANGE } = require('./antinukeHelpers');

module.exports = {
  name: 'guildBanAdd',

  async execute(ban, client) {
    try {
      const guild = ban.guild;
      const cfg = await getDb().antinuke.get(guild.id);
      if (!cfg || !cfg.enabled) return;

      const entry = await fetchAuditEntry(guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      if (!entry || !entry.executor) return;
      const user = entry.executor;

      if (await isExempt(user, guild, cfg, client)) return;

      // Log
      await sendLog(guild, cfg, client, buildContainer({
        emoji: '🛑',
        title: 'Unauthorized Ban',
        description: `**${user.tag}** banned **${ban.user.tag}**`,
        fields: [
          { name: 'Target', value: `${ban.user.tag} (${ban.user.id})` },
          { name: 'Punishment', value: `\`${cfg.punishment}\`` },
        ],
        color: RED,
      }));

      // Undo: unban the target
      await guild.members.unban(ban.user.id, 'Anti-nuke: unauthorized ban').catch(() => {});

      await sendLog(guild, cfg, client, buildContainer({
        emoji: '🔄',
        title: 'Target Unbanned',
        description: `**${ban.user.tag}** has been unbanned.`,
        color: ORANGE,
      }));

      // Punish executor
      await punish(guild, cfg, user);
    } catch (e) {
      logger.warn('guildBanAdd anti-nuke error', e.message);
    }
  },
};
