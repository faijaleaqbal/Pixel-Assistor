// src/commands/moderation/purge.js
// Unified purge command — replaces the old ?clear, ?purgebots, and ?purgeuser.
//
// Three forms:
//   ?purge <number|all>        — delete recent messages (all authors)
//   ?purge human <number|all>   — delete only human (non-bot) messages
//   ?purge bot <number|all>     — delete only bot messages
//
// Handles Discord's bulk-delete constraints:
//   - Max 100 messages per API call (looped automatically)
//   - Messages older than 14 days cannot be bulk-deleted
//   - Rate-limit awareness (small delay between successive calls)

const { EmbedBuilder } = require('discord.js');
const { sendTempReply } = require('../../utils/tempReply');

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const ALL_KEYWORDS = ['all', '\u221e', 'infinite']; // all, ∞, infinite

/** Non-blocking delay to respect rate limits between bulk-delete calls. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/**
 * Core purge engine. Fetches messages backwards in batches of 100, applies an
 * optional filter, and bulk-deletes matching messages younger than 14 days.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {number} count          - How many matching messages to delete (Infinity for "all").
 * @param {function} filterFn     - Returns true for messages that should be candidates for deletion.
 * @returns {{ totalDeleted: number, hitAgeLimit: boolean }}
 */
async function purgeMessages(channel, count, filterFn) {
  let totalDeleted = 0;
  let lastId = null;
  let hitAgeLimit = false;
  const isAll = count === Infinity;
  const maxIterations = isAll ? 500 : Math.ceil(count / 100) + 10;
  const fourteenDaysAgo = Date.now() - FOURTEEN_DAYS_MS;

  for (let i = 0; i < maxIterations; i++) {
    if (!isAll && totalDeleted >= count) break;

    const fetchOptions = { limit: 100 };
    if (lastId) fetchOptions.before = lastId;

    let fetched;
    try {
      fetched = await channel.messages.fetch(fetchOptions);
    } catch {
      break;
    }
    if (!fetched.size) break;

    // Always advance past the oldest message we fetched so we don't re-fetch the same page.
    lastId = fetched.last().id;

    // Apply the caller's filter (human / bot / all).
    const filtered = fetched.filter((m) => filterFn(m));

    // Of the filtered set, only keep messages younger than 14 days.
    const deletable = filtered.filter((m) => m.createdTimestamp > fourteenDaysAgo);

    // If we had matching messages but NONE were deletable (all older than 14 days),
    // we've hit the age wall — stop and report.
    if (filtered.size > 0 && deletable.size === 0) {
      hitAgeLimit = true;
      break;
    }

    if (deletable.size > 0) {
      try {
        const deleted = await channel.bulkDelete(deletable, true);
        totalDeleted += deleted.size;
      } catch {
        // Permission lost mid-operation or other Discord error — stop gracefully.
        break;
      }

      // Small delay between successive bulk-delete calls to avoid rate limits.
      await sleep(500);
    }

    // If we got fewer than 100 messages, we've reached the start of the channel.
    if (fetched.size < 100) break;
  }

  return { totalDeleted, hitAgeLimit };
}

module.exports = {
  name: 'purge',
  aliases: [],
  category: 'moderation',
  description: 'Delete recent messages in this channel',
  usage: '<number|all> | human <number|all> | bot <number|all>',
  cooldown: 3,
  permissions: ['ManageMessages'],
  args: true,

  async execute(message, args) {
    const sub = (args[0] || '').toLowerCase();

    // ── Determine which form the user is invoking ──
    let filterFn;
    let filterLabel;  // null = all, 'human', 'bot'
    let countArg;

    if (sub === 'human') {
      filterFn = (m) => !m.author.bot;
      filterLabel = 'human ';
      countArg = (args[1] || '').toLowerCase();
    } else if (sub === 'bot') {
      filterFn = (m) => m.author.bot;
      filterLabel = 'bot ';
      countArg = (args[1] || '').toLowerCase();
    } else {
      // Default form: ?purge <number|all>
      filterFn = () => true;
      filterLabel = '';
      countArg = sub;
    }

    // ── Validate input ──
    let isAll = false;
    let count;

    if (ALL_KEYWORDS.includes(countArg)) {
      isAll = true;
      count = Infinity;
    } else {
      count = parseInt(countArg, 10);
      if (isNaN(count) || count < 1) {
        const usageEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('\u274c Invalid Usage')
          .setDescription(
            '```\n' +
            '?purge <number|all>        \u2014 Delete recent messages in this channel\n' +
            '?purge human <number|all> \u2014 Delete only human messages\n' +
            '?purge bot <number|all>    \u2014 Delete only bot messages\n' +
            '```'
          );
        return message.reply({ embeds: [usageEmbed] });
      }
    }

    // Delete the command message itself before purging.
    await message.delete().catch(() => {});

    // ── Execute purge ──
    const { totalDeleted, hitAgeLimit } = await purgeMessages(message.channel, count, filterFn);

    // ── Build confirmation reply ──
    if (totalDeleted === 0) {
      const note = hitAgeLimit
        ? 'All matching messages are older than 14 days and cannot be bulk-deleted (Discord API limitation).'
        : `No ${filterLabel}messages found to delete.`;
      return sendTempReply(
        message,
        { embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(note)] },
      );
    }

    let confirmText = `\u2705 Deleted ${totalDeleted} ${filterLabel}messages`;
    if (hitAgeLimit) {
      confirmText +=
        '\n\u26a0\ufe0f Some older messages (>14 days) could not be bulk-deleted (Discord API limitation).';
    }

    return sendTempReply(
      message,
      { embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(confirmText)] },
    );
  },
};
