// src/events/roleCreate.js
// Anti-nuke: rate-limits role creation (5 in 10s). Deletes + punishes on abuse.

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
const { sendLog, punish, isExempt, RED } = require('./antinukeHelpers');

// In-memory rate-limit tracker: Map<guildId_userId, timestamps[]>
const tracker = new Map();
const MAX = 5;
const WINDOW = 10_000;

function cleanTracker() {
  const now = Date.now();
  for (const [key, arr] of tracker) {
    tracker.set(key, arr.filter(t => now - t < WINDOW));
    if (tracker.get(key).length === 0) tracker.delete(key);
  }
}

module.exports = {
  name: 'roleCreate',

  async execute(role, client) {
    try {
      const guild = role.guild;
      const cfg = await getDb().antinuke.get(guild.id);
      if (!cfg || !cfg.enabled) return;

      // Use the role creator from audit log
      // Fetch up to 100 entries (Discord's max per request — effectively unlimited
      // within a single page) and find the one whose target is this role, so
      // rapid-fire role creations don't get the wrong executor attributed.
      const logs = await guild.fetchAuditLogs({ limit: 100, type: AuditLogEvent.RoleCreate }).catch(() => null);
      if (!logs || !logs.entries.size) return;
      let entry = null;
      for (const e of logs.entries.values()) {
        if (e.targetId === role.id) { entry = e; break; }
      }
      // Do NOT fall back to logs.entries.first() — that would attribute the
      // action to whoever happens to be the most recent audit-log actor,
      // which could be a completely unrelated admin.
      if (!entry || !entry.executor) return;
      const user = entry.executor;

      if (await isExempt(user, guild, cfg, client)) return;

      // Rate-limit check
      cleanTracker();
      const key = `${guild.id}_${user.id}`;
      const arr = tracker.get(key) || [];
      arr.push(Date.now());
      tracker.set(key, arr);

      if (arr.length > MAX) {
        // Log
        await sendLog(guild, cfg, client, new EmbedBuilder().setColor(RED)
          .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
          .setTitle('🛑 Role Creation Spam')
          .setDescription(`**${user.tag}** created **${arr.length}** roles in ${WINDOW / 1000}s — deleting <@&${role.id}>`)
          .setTimestamp());

        // Undo: delete the role
        await role.delete('Anti-nuke: creation spam').catch(() => {});

        await punish(guild, cfg, user);
      }
    } catch (e) {
      logger.warn('roleCreate anti-nuke error', e.message);
    }
  },
};
