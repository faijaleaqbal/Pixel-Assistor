// src/events/guildMemberAdd.js
// Re-applies persisted roles + auto-role on join + welcome message.

const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
const { opts, buildContainer } = require('../utils/v2Reply');
const { fetchAuditEntry, sendLog, punish, isExempt, RED, AuditLogEvent } = require('./antinukeHelpers');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const db = getDb();

      // 0. Anti-nuke: unauthorized bot addition check
      if (member.user.bot) {
        try {
          const antinukeCfg = await db.antinuke.get(member.guild.id);
          if (antinukeCfg && antinukeCfg.enabled) {
            const entry = await fetchAuditEntry(member.guild, AuditLogEvent.BotAdd, member.id);
            if (entry && entry.executor) {
              const isAllowed = await isExempt(entry.executor, member.guild, antinukeCfg, member.client);
              if (!isAllowed) {
                await member.kick('Anti-nuke: unauthorized bot addition').catch(() => {});
                await sendLog(member.guild, antinukeCfg, member.client, buildContainer({
                  emoji: '🛑',
                  title: 'Unauthorized Bot Added',
                  description: `**${entry.executor.tag}** added bot **${member.user.tag}** without authorization.`,
                  fields: [
                    { name: 'Bot Tag', value: `${member.user.tag} (\`${member.id}\`)` },
                    { name: 'Punishment', value: `\`${antinukeCfg.punishment}\`` },
                  ],
                  color: RED,
                }));
                await punish(member.guild, antinukeCfg, entry.executor, 'Anti-nuke: unauthorized bot addition');
                return;
              }
            }
          }
        } catch (botErr) {
          logger.warn('anti-nuke bot add error', botErr.message);
        }
      }

      // 1. Persist-role restore
      const roleIds = await db.persistRole.get(member.id, member.guild.id);
      if (roleIds && roleIds.length) {
        const valid = roleIds.map(id => member.guild.roles.cache.get(id)).filter(r => r && r.editable && !r.managed);
        if (valid.length) await member.roles.add(valid).catch(() => {});
      }

      // 2. Auto-role (humans)
      const gCfg = await db.guildConfig.get(member.guild.id);
      if (gCfg && gCfg.autoRoleId && !member.user.bot) {
        const autoRole = member.guild.roles.cache.get(gCfg.autoRoleId);
        if (autoRole && autoRole.editable) await member.roles.add(autoRole).catch(() => {});
      }

      // 2b. Auto-role (bots)
      if (gCfg && gCfg.autoRoleBot && member.user.bot) {
        const botRole = member.guild.roles.cache.get(gCfg.autoRoleBot);
        if (botRole && botRole.editable) await member.roles.add(botRole).catch(() => {});
      }

      // 3. Welcome message (old guildConfig system)
      if (gCfg && gCfg.welcomeChannel && gCfg.welcomeMsg) {
        const ch = member.guild.channels.cache.get(gCfg.welcomeChannel);
        if (ch) {
          const text = gCfg.welcomeMsg
            .replace(/{user}/g, member.user.toString())
            .replace(/{mention}/g, member.user.toString())
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, String(member.guild.memberCount));
          const container = buildContainer({
            title: 'Welcome!',
            description: text,
            color: '#57F287',
            thumbnail: member.user.displayAvatarURL({ size: 128 }),
          });
          await ch.send(opts(container)).catch(() => {});
        }
      }

      // 4. Greet system (new greet config)
      try {
        const greetCfg = await db.greet.get(member.guild.id);
        if (greetCfg && greetCfg.enabled && greetCfg.channels && greetCfg.channels.length) {
          const msgText = (greetCfg.message || 'Welcome to {server}, {user}!')
            .replace(/{user}/g, member.user.toString())
            .replace(/{mention}/g, member.user.toString())
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, String(member.guild.memberCount));

          for (const chId of greetCfg.channels) {
            const ch = member.guild.channels.cache.get(chId);
            if (!ch) continue;

            let sent;
            if (greetCfg.embed) {
              const description = greetCfg.ping ? `${member.user.toString()}\n${msgText}` : msgText;
              const container = buildContainer({
                title: greetCfg.title,
                description,
                color: '#57F287',
                thumbnail: greetCfg.thumbnail,
                image: greetCfg.image,
                customFooter: greetCfg.footer,
              });
              const payload = greetCfg.ping
                ? opts(container, { allowedMentions: { users: [member.user.id] } })
                : opts(container);
              sent = await ch.send(payload).catch(() => {});
            } else {
              const container = buildContainer({
                description: greetCfg.ping ? `${member.user.toString()}\n${msgText}` : msgText,
              });
              const payload = greetCfg.ping
                ? opts(container, { allowedMentions: { users: [member.user.id] } })
                : opts(container);
              sent = await ch.send(payload).catch(() => {});
            }

            if (sent && greetCfg.autoDelete && greetCfg.autoDelete > 0) {
              setTimeout(() => sent.delete().catch(() => {}), greetCfg.autoDelete * 1000);
            }
          }
        }
      } catch { /* greet error — don't crash the handler */ }
    } catch (e) {
      logger.warn(`guildMemberAdd error for ${member.id}`, e.message);
    }
  },
};
