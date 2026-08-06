// src/utils/resolveRole.js
// Universal role-argument resolver. Accepts BOTH a role mention (`@role`)
// AND a raw 17-19 digit role ID.
//
// Usage:
//   const { resolveRoleArg } = require('../../utils/resolveRole');
//   const role = await resolveRoleArg(message, args[0]);
//   if (!role) return; // error already replied

const ID_RE = /^\d{17,19}$/;

/**
 * Resolve a role from a mention OR a raw ID string.
 *
 * @param {import('discord.js').Message} message
 * @param {string} arg - The raw arg token.
 * @param {object} opts - { silent }
 * @returns {Promise<import('discord.js').Role|null>}
 */
async function resolveRoleArg(message, arg, opts = {}) {
  const silent = opts.silent === true;

  // 1) Mention used?
  const mentioned = message.mentions?.roles?.first();
  if (mentioned) return mentioned;

  // 2) Raw role ID?
  if (arg && ID_RE.test(String(arg).trim())) {
    const id = String(arg).trim();
    try {
      const role = await message.guild.roles.fetch(id);
      if (role) return role;
      if (!silent) {
        await safeReply(message, `❌ Role with ID \`${id}\` not found.`);
      }
      return null;
    } catch {
      if (!silent) {
        await safeReply(message, `❌ Role with ID \`${id}\` not found.`);
      }
      return null;
    }
  }

  if (!silent) {
    await safeReply(
      message,
      '❌ Please mention a role or provide a valid role ID.\n' +
      '**Examples:** `@role` or `123456789012345678`'
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

module.exports = { resolveRoleArg };
