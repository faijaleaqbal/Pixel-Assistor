const { getDb } = require('../utils/db');
const { opts, buildContainer } = require('../utils/v2Reply');
const { fetchAuditEntry, sendLog, punish, isExempt, RED, AuditLogEvent } = require('./antinukeHelpers');
const logger = require('../utils/logger');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    try {
      const db = getDb();

      // 0. Anti-nuke: unauthorized kick detection
      try {
        const antinukeCfg = await db.antinuke.get(member.guild.id);
        if (antinukeCfg && antinukeCfg.enabled) {
          const entry = await fetchAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
          if (entry && entry.executor) {
            const isAllowed = await isExempt(entry.executor, member.guild, antinukeCfg, member.client);
            if (!isAllowed) {
              await sendLog(member.guild, antinukeCfg, member.client, buildContainer({
                emoji: '🛑',
                title: 'Unauthorized Member Kick',
                description: `**${entry.executor.tag}** kicked **${member.user.tag}** without authorization.`,
                fields: [
                  { name: 'Target', value: `${member.user.tag} (\`${member.id}\`)` },
                  { name: 'Punishment', value: `\`${antinukeCfg.punishment}\`` },
                ],
                color: RED,
              }));
              await punish(member.guild, antinukeCfg, entry.executor, 'Anti-nuke: unauthorized member kick');
            }
          }
        }
      } catch (kickErr) {
        logger.warn('anti-nuke kick check error', kickErr.message);
      }

      // Persist-role save
      const saved = await db.persistRole.get(member.id, member.guild.id);
      if (saved && saved.length) {
        const current = member.roles.cache.filter(r => !r.managed && r.id !== member.guild.id).map(r => r.id);
        const next = saved.filter(id => current.includes(id));
        if (next.length) await db.persistRole.set(member.id, member.guild.id, next);
        else await db.persistRole.remove(member.id, member.guild.id);
      }

      // Leave message
      const gCfg = await db.guildConfig.get(member.guild.id);
      if (gCfg && gCfg.leaveChannel && gCfg.leaveMsg) {
        const ch = member.guild.channels.cache.get(gCfg.leaveChannel);
        if (ch) {
          const text = gCfg.leaveMsg
            .replace(/{user}/g, member.user.tag)
            .replace(/{server}/g, member.guild.name);
          const container = buildContainer({
            title: 'Goodbye!',
            description: text,
            color: '#ED4245',
            thumbnail: member.user.displayAvatarURL({ size: 128 }),
          });
          await ch.send(opts(container)).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  },
};
