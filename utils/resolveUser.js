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

  // 1) Mention used?
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;

  // 2) Raw user ID?
  if (arg && ID_RE.test(String(arg).trim())) {
    try {
      return await message.client.users.fetch(String(arg).trim());
    } catch {
      if (!silent) {
        await safeReply(message, `❌ Could not find a user with ID \`${arg}\`. The ID may be invalid or the user may not share a server with me.`);
      }
      return null;
    }
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

  // 1) Mention used?
  const mentionedMember = message.mentions?.members?.first();
  if (mentionedMember) return mentionedMember;

  // 2) Raw user ID?
  if (arg && ID_RE.test(String(arg).trim())) {
    const id = String(arg).trim();
    try {
      // First make sure the user exists at all.
      const user = await message.client.users.fetch(id);
      // Then try to fetch the member from the current guild.
      try {
        return await message.guild.members.fetch(user.id);
      } catch {
        if (!silent) {
          await safeReply(message, `❌ <@${id}> (\`${user.tag}\`) is not a member of this server.`);
        }
        return null;
      }
    } catch {
      if (!silent) {
        await safeReply(message, `❌ Could not find a user with ID \`${id}\`.`);
      }
      return null;
    }
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
    await message.reply({ content: text, allowedMentions: { parse: [] } });
  } catch {
    // Channel perms may block replies
  }
}

module.exports = { resolveUserArg, resolveMemberArg, ID_RE };
