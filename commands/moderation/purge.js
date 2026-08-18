// src/commands/moderation/purge.js
// Production-grade Purge Command.
// Deletes exact requested number of eligible messages, handles 100-msg batching,
// safely filters 14-day age limit, verifies bot & user permissions, and self-deletes confirmation.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const ALL_KEYWORDS = ['all', '∞', 'infinite', 'max'];
const MAX_PURGE_LIMIT = 1000; // Sensible safety cap for numeric purge

/** Non-blocking delay to respect rate limits between bulk-delete calls. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a temporary confirmation message to the channel and auto-deletes after `ms`.
 */
async function sendTempConfirmation(channel, options, ms = 5000) {
  try {
    const msg = await channel.send(options);
    if (msg && typeof msg.delete === 'function') {
      setTimeout(() => msg.delete().catch(() => {}), ms).unref?.();
    }
    return msg;
  } catch {
    return null;
  }
}

/**
 * Core purge engine. Fetches messages backwards in batches of 100, applies an
 * optional filter, slices EXACTLY the remaining count needed, and bulk-deletes.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {number} count          - How many matching messages to delete (Infinity for "all").
 * @param {function} filterFn     - Returns true for messages that should be candidates for deletion.
 * @returns {Promise<{ totalDeleted: number, hitAgeLimit: boolean }>}
 */
async function purgeMessages(channel, count, filterFn) {
  let totalDeleted = 0;
  let lastId = null;
  let hitAgeLimit = false;
  const isAll = count === Infinity;
  const maxBatches = isAll ? 100 : Math.ceil(count / 100) + 5;
  const fourteenDaysAgo = Date.now() - FOURTEEN_DAYS_MS;

  for (let batch = 0; batch < maxBatches; batch++) {
    if (!isAll && totalDeleted >= count) break;

    const remainingNeeded = isAll ? 100 : Math.min(100, count - totalDeleted);
    const fetchOptions = { limit: 100 };
    if (lastId) fetchOptions.before = lastId;

    let fetched;
    try {
      fetched = await channel.messages.fetch(fetchOptions);
    } catch {
      break;
    }
    if (!fetched || fetched.size === 0) break;

    // Track pagination cursor to oldest message in batch
    const oldest = fetched.last();
    if (!oldest) break;
    lastId = oldest.id;

    // Apply author/type filter (all / human / bot / user)
    const filtered = fetched.filter((m) => {
      try {
        return filterFn(m);
      } catch {
        return false;
      }
    });

    // Bulk delete only supports messages created within the last 14 days
    const deletable = filtered.filter((m) => m.createdTimestamp > fourteenDaysAgo);

    if (filtered.size > deletable.size) {
      hitAgeLimit = true;
    }

    if (filtered.size > 0 && deletable.size === 0) {
      break;
    }

    if (deletable.size > 0) {
      // SLICE EXACTLY the remaining count needed so we NEVER over-delete
      const toDeleteArray = Array.from(deletable.values()).slice(0, remainingNeeded);

      if (toDeleteArray.length > 0) {
        try {
          const deleted = await channel.bulkDelete(toDeleteArray, true);
          const numDeleted = deleted ? deleted.size : toDeleteArray.length;
          totalDeleted += numDeleted;

          if (!isAll && totalDeleted >= count) {
            break;
          }
        } catch (e) {
          // Gracefully stop on API permission / rate limit error
          break;
        }

        // Small rate limit delay between successive bulk-delete calls
        if (!isAll && totalDeleted < count) {
          await sleep(500);
        }
      }
    }

    // If fewer than 100 messages were fetched, we reached the start of the channel
    if (fetched.size < 100) break;
  }

  return { totalDeleted, hitAgeLimit };
}

module.exports = {
  name: 'purge',
  aliases: ['clear', 'clean', 'prune'],
  category: 'moderation',
  description: 'Delete recent messages in this channel with automated 100-batching and 14-day safety.',
  usage: '<amount|all> | human <amount|all> | bot <amount|all> | user <@user> <amount|all>',
  cooldown: 3,
  permissions: ['ManageMessages'],
  args: true,

  async execute(message, args) {
    if (!message.guild || !message.channel) {
      return message.reply({ content: '❌ The `purge` command can only be used in a server text channel.' });
    }

    // ── 1. Check User Permissions ──
    const userPerms = message.channel.permissionsFor(message.member);
    if (!userPerms || !userPerms.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ You need the **Manage Messages** permission to use this command.'),
        ],
      });
    }

    // ── 2. Check Bot Permissions in this Channel ──
    const botMember = message.guild.members.me || message.client.user;
    const botPerms = message.channel.permissionsFor(botMember);

    if (!botPerms || !botPerms.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ I do not have the **Manage Messages** permission in this channel.'),
        ],
      });
    }

    if (!botPerms.has(PermissionsBitField.Flags.ReadMessageHistory)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription('❌ I need the **Read Message History** permission to purge messages.'),
        ],
      });
    }

    // ── 3. Parse Subcommand & Target ──
    const sub = (args[0] || '').toLowerCase();
    let filterFn;
    let filterLabel = '';
    let countArg = '';

    if (sub === 'human') {
      filterFn = (m) => !m.author?.bot;
      filterLabel = 'human ';
      countArg = (args[1] || '').toLowerCase();
    } else if (sub === 'bot' || sub === 'bots') {
      filterFn = (m) => !!m.author?.bot;
      filterLabel = 'bot ';
      countArg = (args[1] || '').toLowerCase();
    } else if (sub === 'user') {
      const targetUser = message.mentions.users.first() || (args[1] ? { id: args[1].replace(/[<@!>]/g, '') } : null);
      if (!targetUser || !targetUser.id) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Target User')
              .setDescription('Usage: `?purge user <@user> <amount|all>`'),
          ],
        });
      }
      filterFn = (m) => m.author?.id === targetUser.id;
      filterLabel = `user (<@${targetUser.id}>) `;
      countArg = (args[2] || '').toLowerCase();
    } else {
      // Default: ?purge <amount|all>
      filterFn = () => true;
      filterLabel = '';
      countArg = sub;
    }

    // ── 4. Validate Amount ──
    let count;
    if (ALL_KEYWORDS.includes(countArg)) {
      count = Infinity;
    } else {
      if (!/^\d+$/.test(countArg)) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('❌ Invalid Amount')
              .setDescription(
                '❌ Please provide a positive whole number (e.g. `?purge 20`) or `all`.\n\n' +
                '**Syntax Options:**\n' +
                '• `?purge <amount|all>` — Delete recent messages\n' +
                '• `?purge human <amount|all>` — Delete human messages only\n' +
                '• `?purge bot <amount|all>` — Delete bot messages only\n' +
                '• `?purge user <@user> <amount|all>` — Delete specific user messages'
              ),
          ],
        });
      }

      count = parseInt(countArg, 10);
      if (!Number.isInteger(count) || count < 1) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setDescription('❌ Amount must be at least **1**.'),
          ],
        });
      }

      if (count > MAX_PURGE_LIMIT) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setDescription(`❌ Maximum single purge amount is **${MAX_PURGE_LIMIT}** (or use \`?purge all\`).`),
          ],
        });
      }
    }

    // ── 5. Delete command message first if possible ──
    await message.delete().catch(() => {});

    // ── 6. Execute Purge ──
    const { totalDeleted, hitAgeLimit } = await purgeMessages(message.channel, count, filterFn);

    // ── 7. Send Auto-Deleting Confirmation ──
    if (totalDeleted === 0) {
      const note = hitAgeLimit
        ? '⚠️ No messages could be deleted because all matching messages are older than 14 days (Discord limitation).'
        : `ℹ️ No ${filterLabel}messages found to delete.`;
      return sendTempConfirmation(
        message.channel,
        { embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(note)] },
        5000
      );
    }

    let confirmText = `🧹 **Deleted ${totalDeleted} ${filterLabel}message${totalDeleted === 1 ? '' : 's'}.**`;
    if (hitAgeLimit) {
      confirmText += '\n⚠️ Some older messages (>14 days) could not be deleted.';
    }

    return sendTempConfirmation(
      message.channel,
      { embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(confirmText)] },
      5000
    );
  },

  // Export internal functions for unit testing
  purgeMessages,
  MAX_PURGE_LIMIT,
};
