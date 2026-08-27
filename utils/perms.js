// src/utils/perms.js
// Production-grade permissions, hierarchy, and moderation security engine.

const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const config = require('./config');

const FLAGS = PermissionFlagsBits;

// Map short names and snake_case to Discord bitfield flags.
const NAME_TO_FLAG = {};
for (const [k, v] of Object.entries(PermissionFlagsBits)) {
  const lc = k.toLowerCase();
  NAME_TO_FLAG[lc] = v;
  NAME_TO_FLAG[lc.replace(/_/g, '')] = v;
}

function resolveFlag(flagOrName) {
  if (typeof flagOrName === 'bigint' || typeof flagOrName === 'number') {
    return flagOrName;
  }
  if (typeof flagOrName === 'string') {
    return NAME_TO_FLAG[flagOrName.toLowerCase()] || null;
  }
  return null;
}

function hasPermission(member, flagOrName) {
  if (!member) return false;
  if (member.permissions?.has(FLAGS.Administrator)) return true;
  const flag = resolveFlag(flagOrName);
  if (!flag) return false;
  return member.permissions?.has(flag) ?? false;
}

function isBotOwner(userId) {
  if (!userId) return false;
  if (config.ownerId && userId === config.ownerId) return true;
  if (Array.isArray(config.ownerIds) && config.ownerIds.includes(userId)) return true;
  return false;
}

function isGuildOwner(memberOrId, guild) {
  const userId = typeof memberOrId === 'string' ? memberOrId : memberOrId?.id;
  const g = guild || memberOrId?.guild;
  if (!g || !userId) return false;
  return g.ownerId === userId;
}

function isOwner(userId, guild) {
  if (!userId) return false;
  if (isBotOwner(userId)) return true;
  if (guild && isGuildOwner(userId, guild)) return true;
  return false;
}

async function isTrustedOwner(userId, guild) {
  if (!userId) return false;
  // 1. Bot creator / global owner
  if (isBotOwner(userId)) return true;
  // 2. Guild owner
  const g = guild;
  if (g && isGuildOwner(userId, g)) return true;
  // 3. Guild Extra / Trusted Owners from DB
  if (g && g.id) {
    try {
      const { getDb } = require('./db');
      const db = getDb();
      const gCfg = await db.guildConfig.get(g.id);
      const extra = gCfg?.extraOwners || gCfg?.ownerRoles || [];
      if (Array.isArray(extra) && extra.includes(userId)) return true;
    } catch {
      // fallback
    }
  }
  return false;
}

async function getTrustedOwners(guild) {
  if (!guild || !guild.id) return { guildOwnerId: null, extraOwners: [] };
  let extraOwners = [];
  try {
    const { getDb } = require('./db');
    const db = getDb();
    const gCfg = await db.guildConfig.get(guild.id);
    extraOwners = gCfg?.extraOwners || gCfg?.ownerRoles || [];
  } catch {}
  return {
    guildOwnerId: guild.ownerId,
    extraOwners: Array.isArray(extraOwners) ? extraOwners : [],
  };
}

function missingNames(member, flagNames = []) {
  const missing = [];
  for (const name of flagNames) {
    if (!hasPermission(member, name)) missing.push(name);
  }
  return missing;
}

function checkBotPermissions(context, requiredPerms = []) {
  const guild = context.guild;
  if (!guild) return { ok: true, missing: [] };
  const botMember = guild.members.me;
  if (!botMember) return { ok: false, missing: requiredPerms };

  const channel = context.channel && typeof context.channel.permissionsFor === 'function'
    ? context.channel
    : null;

  const perms = channel ? channel.permissionsFor(botMember) : botMember.permissions;
  if (!perms) return { ok: false, missing: requiredPerms };
  if (perms.has(FLAGS.Administrator)) return { ok: true, missing: [] };

  const missing = [];
  for (const p of requiredPerms) {
    const flag = resolveFlag(p);
    if (flag && !perms.has(flag)) {
      missing.push(p);
    }
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Validate whether actor can perform a moderation action on targetMember.
 * Checks guild owner restrictions, self-target, bot-target, actor hierarchy, and bot hierarchy.
 */
function canManageMember(actor, targetMember, guild, options = {}) {
  const { allowSelf = false, allowBot = false, checkBot = true, actionName = 'manage' } = options;
  const g = guild || actor.guild;
  const clientUser = actor.client?.user || targetMember?.client?.user || g?.members?.me?.user;

  if (!targetMember) {
    return { ok: false, error: 'Target member not found.' };
  }

  // 1. Server owner check (immune to all moderation actions)
  if (targetMember.id === g.ownerId) {
    return { ok: false, error: `You cannot ${actionName} the server owner.` };
  }

  // 2. Self check
  if (targetMember.id === actor.id) {
    if (!allowSelf) {
      return { ok: false, error: `You cannot ${actionName} yourself.` };
    }
    return { ok: true };
  }

  // 3. Bot self check
  if (clientUser && targetMember.id === clientUser.id && !allowBot) {
    return { ok: false, error: `I cannot ${actionName} myself.` };
  }

  // 4. Actor hierarchy check (owner bypasses)
  if (actor.id !== g.ownerId) {
    const actorPos = actor.roles?.highest?.position ?? 0;
    const targetPos = targetMember.roles?.highest?.position ?? 0;
    if (actorPos <= targetPos) {
      return {
        ok: false,
        error: `You cannot ${actionName} that member — their highest role is equal to or higher than yours.`,
      };
    }
  }

  // 5. Bot hierarchy check
  if (checkBot) {
    const botMember = g.members?.me;
    if (botMember) {
      const botPos = botMember.roles?.highest?.position ?? 0;
      const targetPos = targetMember.roles?.highest?.position ?? 0;
      if (botPos <= targetPos) {
        return {
          ok: false,
          error: `I cannot ${actionName} that member — their highest role is equal to or higher than my highest role.`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Validate whether actor can create, edit, delete, assign, or remove a role.
 */
function canManageRole(actor, role, guild, options = {}) {
  const { checkManaged = true, actionName = 'manage' } = options;
  const g = guild || actor.guild;

  if (!role) {
    return { ok: false, error: 'Role not found.' };
  }

  // 1. @everyone check
  if (role.id === g.id) {
    return { ok: false, error: `Cannot ${actionName} the @everyone role.` };
  }

  // 2. Managed / integration role check
  if (checkManaged && role.managed) {
    return { ok: false, error: `Cannot ${actionName} a bot or integration-managed role.` };
  }

  // 3. Actor hierarchy check
  if (actor.id !== g.ownerId) {
    const actorPos = actor.roles?.highest?.position ?? 0;
    if (role.position >= actorPos) {
      return {
        ok: false,
        error: `You cannot ${actionName} that role — it is equal to or higher than your highest role.`,
      };
    }
  }

  // 4. Bot hierarchy check
  const botMember = g.members?.me;
  if (botMember) {
    const botPos = botMember.roles?.highest?.position ?? 0;
    if (role.position >= botPos) {
      return {
        ok: false,
        error: `I cannot ${actionName} that role — it is equal to or higher than my highest role.`,
      };
    }
  }

  return { ok: true };
}

module.exports = {
  hasPermission,
  isOwner,
  isBotOwner,
  isGuildOwner,
  isTrustedOwner,
  getTrustedOwners,
  missingNames,
  checkBotPermissions,
  canManageMember,
  canManageRole,
  resolveFlag,
  FLAGS,
  NAME_TO_FLAG,
  PermissionsBitField,
};
