// src/events/guildBanAdd.js
// Anti-nuke: detects unauthorized bans and unbans the target + punishes executor.

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
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
      await sendLog(guild, cfg, client, new EmbedBuilder().setColor(RED)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setTitle('🛑 Unauthorized Ban')
        .setDescription(`**${user.tag}** banned **${ban.user.tag}**`)
        .addFields(
          { name: 'Target', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
          { name: 'Punishment', value: `\`${cfg.punishment}\``, inline: true },
        ).setTimestamp());

      // Undo: unban the target
      await guild.members.unban(ban.user.id, 'Anti-nuke: unauthorized ban').catch(() => {});

      await sendLog(guild, cfg, client, new EmbedBuilder().setColor(ORANGE)
        .setTitle('🔄 Target Unbanned')
        .setDescription(`**${ban.user.tag}** has been unbanned.`));

      // Punish executor
      await punish(guild, cfg, user);
    } catch (e) {
      logger.warn('guildBanAdd anti-nuke error', e.message);
    }
  },
};
