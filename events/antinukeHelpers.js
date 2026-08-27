// src/events/antinukeHelpers.js
// Shared helpers for anti-nuke event listeners & protection engine.

const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { opts } = require('../utils/v2Reply');
const { isTrustedOwner, isBotOwner } = require('../utils/perms');
const logger = require('../utils/logger');

const RED = 0xED4245, ORANGE = 0xFF6B00, GREEN = 0x57F287, BLUE = 0x5865F2;

// In-memory lock to prevent duplicate punishment execution on the same user during rapid events
const activePunishments = new Set();

// Map of string action names used by callers → discord.js AuditLogEvent enum
const ACTION_MAP = {
  ROLE_CREATE: AuditLogEvent.RoleCreate,
  ROLE_DELETE: AuditLogEvent.RoleDelete,
  ROLE_UPDATE: AuditLogEvent.RoleUpdate,
  CHANNEL_CREATE: AuditLogEvent.ChannelCreate,
  CHANNEL_DELETE: AuditLogEvent.ChannelDelete,
  CHANNEL_UPDATE: AuditLogEvent.ChannelUpdate,
  MEMBER_BAN_ADD: AuditLogEvent.MemberBanAdd,
  MEMBER_BAN_REMOVE: AuditLogEvent.MemberBanRemove,
  MEMBER_KICK: AuditLogEvent.MemberKick,
  BOT_ADD: AuditLogEvent.BotAdd,
  WEBHOOK_CREATE: AuditLogEvent.WebhookCreate,
  WEBHOOK_DELETE: AuditLogEvent.WebhookDelete,
  GUILD_UPDATE: AuditLogEvent.GuildUpdate,
};

/**
 * Fetch the most recent audit log entry matching type and targetId.
 * Returns null if not found or older than 8 seconds.
 */
async function fetchAuditEntry(guild, type, targetId = null) {
  if (!guild || typeof guild.fetchAuditLogs !== 'function') return null;

  try {
    const resolved = typeof type === 'string' ? ACTION_MAP[type] : type;
    if (resolved == null) return null;

    const botMember = guild.members?.me;
    if (botMember && !botMember.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
      return null;
    }

    const logs = await guild.fetchAuditLogs({ limit: 10, type: resolved }).catch(() => null);
    if (!logs || !logs.entries.size) return null;

    const now = Date.now();
    for (const entry of logs.entries.values()) {
      if (targetId && entry.targetId !== targetId) continue;
      if (now - entry.createdTimestamp > 8000) continue;
      return entry;
    }
    return null;
  } catch (err) {
    logger.warn(`fetchAuditEntry error in ${guild.id}`, err.message);
    return null;
  }
}

/**
 * Send a Components V2 container to the configured anti-nuke log channel.
 */
async function sendLog(guild, cfg, client, container) {
  if (!cfg || !cfg.logChannel || !guild) return;
  try {
    const ch = guild.channels.cache.get(cfg.logChannel) || client.channels.cache.get(cfg.logChannel);
    if (ch && typeof ch.send === 'function') {
      await ch.send(opts(container)).catch(() => {});
    }
  } catch {}
}

/**
 * Check if a user is exempt from anti-nuke checks (Bot creator, Guild owner, Trusted owners, Whitelist).
 */
async function isExempt(user, guild, cfg, client) {
  if (!user || !user.id) return true;

  // 1. Bot itself is always exempt (avoids self-action loops)
  if (client?.user?.id && user.id === client.user.id) return true;
  if (guild?.members?.me?.id && user.id === guild.members.me.id) return true;

  // 2. Global Bot Creator check
  if (isBotOwner(user.id)) return true;

  // 3. Primary Server Owner and Server Trusted Owners
  const isOwner = await isTrustedOwner(user.id, guild);
  if (isOwner) return true;

  // 4. Anti-nuke module specific owners
  if (cfg && Array.isArray(cfg.owners) && cfg.owners.includes(user.id)) return true;

  // 5. Anti-nuke module specific user whitelist
  if (cfg && Array.isArray(cfg.whitelist) && cfg.whitelist.includes(user.id)) return true;

  // 6. Anti-nuke module specific role whitelist
  if (cfg && Array.isArray(cfg.wlRoles) && cfg.wlRoles.length > 0 && guild) {
    try {
      const member = user.roles ? user : await guild.members?.fetch?.(user.id).catch(() => null);
      if (member?.roles?.cache) {
        if (member.roles.cache.some((r) => cfg.wlRoles.includes(r.id))) return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Apply punishment to an unauthorized user (ban / kick / strip roles).
 * Prevents race conditions and self/owner punishment.
 */
async function punish(guild, cfg, user, actionReason = 'Anti-nuke: unauthorized server modification') {
  if (!user || !user.id || !guild) return;

  // Check exemption again as a strict guard
  if (await isExempt(user, guild, cfg, guild.client)) return;

  const lockKey = `${guild.id}:${user.id}`;
  if (activePunishments.has(lockKey)) return;
  activePunishments.add(lockKey);
  setTimeout(() => activePunishments.delete(lockKey), 10000);

  try {
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const punishment = (cfg?.punishment || 'ban').toLowerCase();

    if (punishment === 'ban') {
      if (member.bannable) {
        await member.ban({ reason: actionReason }).catch(() => {});
      }
    } else if (punishment === 'kick') {
      if (member.kickable) {
        await member.kick(actionReason).catch(() => {});
      }
    } else if (punishment === 'strip') {
      const botMember = guild.members.me;
      if (botMember && botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        const botHighest = botMember.roles.highest.position;
        const targetRoles = member.roles.cache.filter(
          (r) => r.id !== guild.id && r.position < botHighest && !r.managed
        );
        if (targetRoles.size > 0) {
          await member.roles.remove(targetRoles, actionReason).catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.warn(`punish error for ${user.id} in ${guild.id}`, err.message);
  }
}

module.exports = {
  fetchAuditEntry,
  sendLog,
  punish,
  isExempt,
  RED,
  ORANGE,
  GREEN,
  BLUE,
  ACTION_MAP,
  AuditLogEvent,
};
