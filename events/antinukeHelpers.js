// src/events/antinukeHelpers.js
// Shared helpers for anti-nuke event listeners.

const { AuditLogEvent } = require('discord.js');

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
    const logs = await guild.fetchAuditLogs({ limit: 100, type: resolved }).catch(() => null);
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
 * Send an embed to the configured anti-nuke log channel.
 */
async function sendLog(guild, cfg, client, embed) {
  if (!cfg || !cfg.logChannel) return;
  const ch = client.channels.cache.get(cfg.logChannel);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Apply punishment to a user (ban / kick / strip roles).
 */
async function punish(guild, cfg, user) {
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  if (cfg.punishment === 'ban') {
    await member.ban({ reason: 'Anti-nuke: unauthorized action' }).catch(() => {});
  } else if (cfg.punishment === 'kick') {
    await member.kick('Anti-nuke: unauthorized action').catch(() => {});
  } else if (cfg.punishment === 'strip') {
    if (!guild.members.me) return;
    const botHighest = guild.members.me.roles.highest;
    await member.roles.set(member.roles.cache.filter(r => r.id === r.guild.id || r.position >= botHighest.position || r.managed).map(r => r.id)).catch(() => {});
  }
}

/**
 * Check if a user is exempt from anti-nuke checks.
 */
async function isExempt(user, guild, cfg, client) {
  if (!cfg) return true;
  // user may be a User object (from audit log) — fetch GuildMember for roles
  const member = user.roles
    ? user // already a GuildMember
    : await guild.members.fetch(user.id).catch(() => null);
  const hasWlRole = member && cfg.wlRoles && member.roles.cache.some(r => cfg.wlRoles.includes(r.id));
  return guild.ownerId === user.id
    || (cfg.owners || []).includes(user.id)
    || (cfg.whitelist || []).includes(user.id)
    || hasWlRole
    || user.id === client.user.id;
}

module.exports = { fetchAuditEntry, sendLog, punish, isExempt, RED, ORANGE, ACTION_MAP, AuditLogEvent };
