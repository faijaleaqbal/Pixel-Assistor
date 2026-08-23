// src/utils/reminderPoller.js
// Polls DB for due reminders, timers, and scheduled messages every 30s.
// Also fires any that were missed while the bot was offline on startup.
// All four systems are handled:
//   1. Legacy reminder (channel mention)
//   2. user_reminder (DM the user)
//   3. timer (edit channel message + DM the user)
//   4. scheduled_messages (bot sends a message to a channel at a scheduled time)

const logger = require('./logger');
const { getDb } = require('./db');
const { opts, buildContainer } = require('./v2Reply');

let interval = null;

// ── Helper: DM a user safely ──
async function safeDm(user, container) {
  try {
    await user.send(opts(container));
  } catch {
    // DMs closed — skip gracefully
  }
}

// ── Deliver a legacy reminder (channel message) ──
async function deliverLegacyReminder(client, r) {
  try {
    const ch = await client.channels.fetch(r.channelId).catch(() => null);
    if (ch) {
      const container = buildContainer({
        description: `<@${r.userId}> \u23F0 Reminder: ${r.message || '(no message)'}`,
      });
      await ch.send(opts(container, { allowedMentions: { users: [r.userId] } })).catch(() => {});
    }
  } catch (e) {
    logger.warn(`legacy reminder deliver failed for ${r._id}`, e.message);
  }
  try { await getDb().reminder.remove(r._id); } catch {}
}

// ── Deliver a user_reminder (DM) ──
async function deliverUserReminder(client, r) {
  try {
    const user = await client.users.fetch(r.userId).catch(() => null);
    if (!user) return;

    const jumpLink = `https://discord.com/channels/${r.guildId}/${r.channelId}`;
    const container = buildContainer({
      title: '\u23F0 Reminder!',
      color: 0x5865F2,
      fields: [
        { name: 'Reason', value: r.reason || '(no reason)' },
        { name: 'Set', value: `<t:${Math.floor(r.createdAt / 1000)}:R>` },
        { name: 'Channel', value: `[Jump](${jumpLink})` },
      ],
    });

    await safeDm(user, container);
  } catch (e) {
    logger.warn(`user reminder deliver failed for ${r._id}`, e.message);
  }
  try { await getDb().userReminder.markFired(r._id); } catch {}
}

// ── Deliver a timer (edit message + DM) ──
async function deliverTimer(client, r) {
  try {
    const user = await client.users.fetch(r.userId).catch(() => null);

    // Edit the original channel message
    try {
      const ch = await client.channels.fetch(r.channelId).catch(() => null);
      if (ch && r.messageId) {
        const msg = await ch.messages.fetch(r.messageId).catch(() => null);
        if (msg) {
          const doneContainer = buildContainer({
            title: '\u2705 Timer ended',
            description: `**${r.reason || 'No reason provided.'}**`,
            color: 0x57F287,
            customFooter: `Set by ${user ? user.tag : r.userId}`,
          });
          await msg.edit(opts(doneContainer)).catch(() => {});
        }
      }
    } catch {
      // Message may have been deleted
    }

    // DM the user
    if (user) {
      const jumpLink = `https://discord.com/channels/${r.guildId}/${r.channelId}`;
      const dmContainer = buildContainer({
        title: '\u23F0 Timer finished!',
        color: 0x5865F2,
        fields: [
          { name: 'Reason', value: r.reason || '(no reason)' },
          { name: 'Set', value: `<t:${Math.floor(r.createdAt / 1000)}:R>` },
          { name: 'Channel', value: `[Jump](${jumpLink})` },
        ],
      });
      await safeDm(user, dmContainer);
    }
  } catch (e) {
    logger.warn(`timer deliver failed for ${r._id}`, e.message);
  }
  try { await getDb().timer.markFired(r._id); } catch {}
}

// ── Single tick: fire all due items ──
async function tick(client) {
  const now = Date.now();
  let db;
  try {
    db = getDb();
  } catch { return; }

  // 1. Legacy reminders
  try {
    const due = await db.reminder.due(now);
    for (const r of due) await deliverLegacyReminder(client, r);
  } catch (e) {
    logger.debug(`legacy reminder tick error: ${e.message}`);
  }

  // 2. User reminders
  try {
    const due = await db.userReminder.due(now);
    for (const r of due) await deliverUserReminder(client, r);
  } catch (e) {
    logger.debug(`user reminder tick error: ${e.message}`);
  }

    // 3. Timers
  try {
    const due = await db.timer.due(now);
    for (const r of due) await deliverTimer(client, r);
  } catch (e) {
    logger.debug(`timer tick error: ${e.message}`);
  }

  // 4. Scheduled messages
  try {
    const due = await db.scheduled.due(now);
    for (const r of due) await deliverScheduledMessage(client, r);
  } catch (e) {
    logger.debug(`scheduled message tick error: ${e.message}`);
  }
}

// ── Deliver a scheduled message ──
async function deliverScheduledMessage(client, r) {
  try {
    const ch = await client.channels.fetch(r.channelId).catch(() => null);
    if (!ch) {
      logger.warn(`scheduled msg #${r._id}: channel ${r.channelId} not found, skipping.`);
      try { await getDb().scheduled.markSent(r._id); } catch {}
      return;
    }

    const sendOpts = opts(buildContainer({ description: r.content }));
    if (r.attachmentUrl) {
      sendOpts.files = [{ attachment: r.attachmentUrl, name: r.attachmentName || 'scheduled-attachment' }];
    }

    await ch.send(sendOpts);
    await getDb().scheduled.markSent(r._id);
  } catch (e) {
    logger.warn(`scheduled msg #${r._id} deliver failed: ${e.message}`);
    try { await getDb().scheduled.markSent(r._id); } catch {}
  }
}

// ── Fire everything missed while offline (called once on startup) ──
async function fireMissed(client) {
  try {
    const now = Date.now();
    const db = getDb();

    const legacyDue = await db.reminder.due(now);
    for (const r of legacyDue) await deliverLegacyReminder(client, r);

    const userDue = await db.userReminder.due(now);
    for (const r of userDue) await deliverUserReminder(client, r);

    const timerDue = await db.timer.due(now);
    for (const r of timerDue) await deliverTimer(client, r);

    const schedDue = await db.scheduled.due(now);
    for (const r of schedDue) await deliverScheduledMessage(client, r);

    const total = legacyDue.length + userDue.length + timerDue.length + schedDue.length;
    if (total > 0) {
      logger.info(`Fired ${total} missed reminder(s)/timer(s)/scheduled message(s) on startup.`);
    }
  } catch (e) {
    logger.warn(`fireMissed error: ${e.message}`);
  }
}

// ── Start the poller ──
function start(client) {
  if (interval) clearInterval(interval);
  // Fire any missed immediately on startup
  fireMissed(client).catch(() => {});
  // Poll every 30 seconds
  interval = setInterval(() => tick(client).catch(() => {}), 30000);
  logger.info('Reminder/timer/scheduled-message poller started (30s).');
}

module.exports = { start };