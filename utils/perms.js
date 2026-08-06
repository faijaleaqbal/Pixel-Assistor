// src/utils/perms.js
// Permission helpers — used by moderation commands and the central error handler.

const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');

const FLAGS = PermissionFlagsBits;

// Map short names to Discord bitfield flags. Used by moderation commands so users
// can write `ManageMessages`, `manage_messages`, or `managemessages` interchangeably.
const NAME_TO_FLAG = {};
for (const [k, v] of Object.entries(PermissionFlagsBits)) {
  const lc = k.toLowerCase();
  NAME_TO_FLAG[lc] = v;
  NAME_TO_FLAG[lc.replace(/_/g, '')] = v;
}

function hasPermission(member, flagOrName) {
  if (!member) return false;
  if (member.permissions?.has(FLAGS.Administrator)) return true;
  const flag = typeof flagOrName === 'string' ? NAME_TO_FLAG[flagOrName.toLowerCase()] : flagOrName;
  if (!flag) return false;
  return member.permissions?.has(flag) ?? false;
}

function isOwner(userId) {
  const config = require('./config');
  if (!userId) return false;
  if (config.ownerId && userId === config.ownerId) return true;
  if (Array.isArray(config.ownerIds) && config.ownerIds.includes(userId)) return true;
  return false;
}

// Returns a friendly list of permission names missing for a member.
function missingNames(member, flagNames = []) {
  const missing = [];
  for (const name of flagNames) {
    if (!hasPermission(member, name)) missing.push(name);
  }
  return missing;
}

module.exports = { hasPermission, isOwner, missingNames, FLAGS, NAME_TO_FLAG, PermissionsBitField };
