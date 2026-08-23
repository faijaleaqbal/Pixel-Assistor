// src/utils/resolveUser.js
// Universal user-argument resolver. Accepts BOTH a real Discord mention (`<@id>` / `<@!id>`)
// AND a raw 17-19 digit user ID. Every command that takes a `<@user>` argument should
// call this helper instead of `message.mentions.users.first()` alone — that way
// `?ban @user` and `?ban 123456789012345678` behave identically.
//
// Returns a Discord User object on success, or null on failure (with an optional
// reply sent to the channel explaining why).
//
// Usage:
//   const { resolveUserArg, resolveMemberArg } = require('../../utils/resolveUser');
//
//   const target = await resolveUserArg(message, args[0]);
//   if (!target) return; // error already replied
//
//   const member = await resolveMemberArg(message, args[0]);
//   if (!member) return; // error already replied

const ID_RE = /^\d{17,19}$/;
const MENTION_RE = /^<@!?(\d{17,19})>$/;
const { buildContainer, opts } = require('./v2Reply');

function extractUserId(arg) {
  if (!arg) return null;
  const str = String(arg).trim();
  const match = str.match(MENTION_RE);
  if (match) return match[1];
  if (ID_RE.test(str)) return str;
  return null;
}

/**
 * Resolve a user from a mention OR a raw ID string.
 *
 * @param {import('discord.js').Message} message - The invoking command message.
 * @param {string} arg - The raw arg token (e.g. "<@123>" or "123456789012345678").
 * @param {object} opts - Optional flags.
 * @param {boolean} opts.silent - If true, do NOT auto-reply on failure (caller handles).
 * @returns {Promise<import('discord.js').User|null>} Resolved User, or null.
 */
async function resolveUserArg(message, arg, opts = {}) {
  const silent = opts.silent === true;
  const targetId = extractUserId(arg);

  if (targetId) {
    // Check mentions collection first for speed
    const fromMention = message.mentions?.users?.get(targetId);
    if (fromMention) return fromMention;

    try {
      return await message.client.users.fetch(targetId);
    } catch {
      if (!silent) {
        await safeReply(message, `❌ Could not find a user with ID \`${targetId}\`. The ID may be invalid or the user does not exist.`);
      }
      return null;
    }
  }

  // Fallback: if arg wasn't an explicit mention or raw ID, check if there's any mention
  if (!arg && message.mentions?.users?.size) {
    return message.mentions.users.first();
  }

  if (!silent) {
    await safeReply(
      message,
      '❌ Please mention a user or paste their user ID.\n' +
      '**Examples:** `@user` or `123456789012345678`'
    );
  }
  return null;
}

/**
 * Resolve a guild member from a mention OR a raw ID.
 * Same parsing logic as resolveUserArg, but returns a GuildMember.
 *
 * @param {import('discord.js').Message} message
 * @param {string} arg
 * @param {object} opts - { silent }
 * @returns {Promise<import('discord.js').GuildMember|null>}
 */
async function resolveMemberArg(message, arg, opts = {}) {
  const silent = opts.silent === true;
  const targetId = extractUserId(arg);

  if (targetId) {
    const fromMemberMention = message.mentions?.members?.get(targetId);
    if (fromMemberMention) return fromMemberMention;

    try {
      return await message.guild.members.fetch(targetId);
    } catch {
      // User might exist on Discord but not in this guild
      let userTag = targetId;
      try {
        const u = await message.client.users.fetch(targetId);
        userTag = u.tag;
      } catch {}

      if (!silent) {
        await safeReply(message, `❌ <@${targetId}> (\`${userTag}\`) is not a member of this server.`);
      }
      return null;
    }
  }

  // Fallback: if arg wasn't an explicit mention or raw ID, check if there's any member mention
  if (!arg && message.mentions?.members?.size) {
    return message.mentions.members.first();
  }

  if (!silent) {
    await safeReply(
      message,
      '❌ Please mention a user or paste their user ID.\n' +
      '**Examples:** `@user` or `123456789012345678`'
    );
  }
  return null;
}

async function safeReply(message, text) {
  try {
    await message.reply(
      opts(buildContainer({ description: text }), { allowedMentions: { parse: [] } }),
    );
  } catch {
    // Channel perms may block replies
  }
}

module.exports = { resolveUserArg, resolveMemberArg, extractUserId, ID_RE };
