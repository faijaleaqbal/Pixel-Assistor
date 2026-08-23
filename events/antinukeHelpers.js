// src/events/antinukeHelpers.js
// Shared helpers for anti-nuke event listeners.

const { AuditLogEvent } = require('discord.js');
const { opts } = require('../utils/v2Reply');

const RED = 0xED4245, ORANGE = 0xFF6B00;

// Map of string action names used by callers → discord.js AuditLogEvent enum
// values. discord.js v14 forwards the `type` option verbatim into the
// `action_type` query parameter of the REST request, and Discord requires it
// to be an integer (1-112). Passing the string 'ROLE_CREATE' results in a 400
// "Invalid Form Body" which the .catch(()=>null) in every callsite silently
// swallowed — making the entire antinuke feature dead. This map fixes that.
const ACTION_MAP = {
  ROLE_CREATE: AuditLogEvent.RoleCreate,
  ROLE_DELETE: AuditLogEvent.RoleDelete,
  CHANNEL_CREATE: AuditLogEvent.ChannelCreate,
  CHANNEL_DELETE: AuditLogEvent.ChannelDelete,
  MEMBER_BAN_ADD: AuditLogEvent.MemberBanAdd,
  MEMBER_KICK: AuditLogEvent.MemberKick,
};

/**
 * Fetch the most recent audit log entry matching type and targetId.
 * Returns null if not found or older than 5 seconds.
 *
 * `type` may be either an AuditLogEvent enum value (number) or one of the
 * legacy string keys in ACTION_MAP.
 *
 * Fetches up to 100 entries (Discord's per-request maximum — effectively
 * "unlimited" within a single audit-log page) so that, when multiple actions
 * happen in quick succession, we still find the one whose target matches.
 */
async function fetchAuditEntry(guild, type, targetId) {
  try {
    const resolved = typeof type === 'string' ? ACTION_MAP[type] : type;
    if (resolved == null) return null;
    const logs = await guild.fetchAuditLogs({ limit: 10, type: resolved }).catch(() => null);
    if (!logs || !logs.entries.size) return null;
    // Find the first entry whose target matches and which is recent.
    for (const entry of logs.entries.values()) {
      if (entry.targetId !== targetId) continue;
      if (Date.now() - entry.createdTimestamp > 5000) continue;
      return entry;
    }
    return null;
  } catch { return null; }
}

/**
 * Send a Components V2 container to the configured anti-nuke log channel.
 */
async function sendLog(guild, cfg, client, container) {
  if (!cfg || !cfg.logChannel) return;
  const ch = client.channels.cache.get(cfg.logChannel);
  if (ch) ch.send(opts(container)).catch(() => {});
}

/**
 * Apply punishment to a user (ban / kick / strip roles).
 * Never punishes the guild owner, bot owner, configured antinuke owners, or the bot itself.
 */
async function punish(guild, cfg, user) {
  if (!user || !user.id || !guild) return;
  if (user.id === guild.ownerId || (cfg.owners || []).includes(user.id)) return;
  if (guild.members.me && user.id === guild.members.me.id) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  if (cfg.punishment === 'ban') {
    await member.ban({ reason: 'Anti-nuke: unauthorized action' }).catch(() => {});
  } else if (cfg.punishment === 'kick') {
    await member.kick('Anti-nuke: unauthorized action').catch(() => {});
  } else if (cfg.punishment === 'strip') {
    if (!guild.members.me) return;
    const botHighest = guild.members.me.roles.highest;
    await member.roles
      .set(
        member.roles.cache
          .filter((r) => r.id === r.guild.id || r.position >= botHighest.position || r.managed)
          .map((r) => r.id)
      )
      .catch(() => {});
  }
}

/**
 * Check if a user is exempt from anti-nuke checks.
 */
async function isExempt(user, guild, cfg, client) {
  if (!cfg || !user) return true;
  if (guild && guild.ownerId === user.id) return true;
  if (client && client.user && user.id === client.user.id) return true;
  if (Array.isArray(cfg.owners) && cfg.owners.includes(user.id)) return true;
  if (Array.isArray(cfg.whitelist) && cfg.whitelist.includes(user.id)) return true;

  // Check roles if guild and member available
  if (guild && Array.isArray(cfg.wlRoles) && cfg.wlRoles.length > 0) {
    const member = user.roles ? user : await guild.members?.fetch?.(user.id).catch(() => null);
    if (member && member.roles) {
      if (member.roles.cache && typeof member.roles.cache.some === 'function') {
        if (member.roles.cache.some((r) => cfg.wlRoles.includes(r.id))) return true;
      } else if (Array.isArray(member.roles)) {
        if (member.roles.some((r) => cfg.wlRoles.includes(r.id || r))) return true;
      }
    }
  }

  return false;
}

module.exports = { fetchAuditEntry, sendLog, punish, isExempt, RED, ORANGE, ACTION_MAP, AuditLogEvent };
