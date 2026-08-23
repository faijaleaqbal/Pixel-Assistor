// src/utils/tempReply.js
// Shared utility: send a reply and auto-delete it after a delay.
// Used for short action-confirmation messages ("✅ Done" style),
// NOT for informational replies the user needs to keep reading.
// Plain strings are auto-wrapped into a Components V2 container;
// pre-built payloads (v2Reply.opts(...) output) are passed through as-is.

const { buildContainer, opts } = require('./v2Reply');

/**
 * Send a temporary reply that auto-deletes after `ms` milliseconds.
 * @param {import('discord.js').Message} message - The original command message.
 * @param {string|import('discord.js').MessageCreateOptions} content - Text or Discord message options.
 * @param {number} ms - Delay in milliseconds before deletion (default 5000).
 * @returns {Promise<import('discord.js').Message|null>}
 */
async function sendTempReply(message, content, ms = 5000) {
  const payload = typeof content === 'string'
    ? opts(buildContainer({ description: content }))
    : { ...content };
  payload.allowedMentions = { parse: [] };
  try {
    const msg = await message.reply(payload);
    if (msg) {
      setTimeout(() => msg.delete().catch(() => {}), ms).unref?.();
    }
    return msg;
  } catch {
    return null;
  }
}

module.exports = { sendTempReply };
