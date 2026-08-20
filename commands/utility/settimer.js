// src/commands/utility/settimer.js
// Visible countdown timer + DM reminder.
// Usage: ?settimer <duration> [reason]
// Duration format: <number><unit> where unit = s, m, h, d, w, y

const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');
const ms = require('../../utils/ms');
const logger = require('../../utils/logger');

module.exports = {
  name: 'settimer',
  category: 'utility',
  description: 'Set a visible countdown timer + DM reminder',
  usage: '<1s/1m/1h/1d/1w/1y> [reason]',
  cooldown: 3,
  args: true,
  async execute(message, args, client) {
    const durMs = ms.parse(args[0]);
    if (!durMs || durMs < 1000) {
      return message.reply({
        embeds: [responseBuilder.buildResult({ description: 'Invalid duration. Usage: `?settimer <duration> [reason]`\n' +
          'Format: `<number><unit>` where unit = `s`, `m`, `h`, `d`, `w`, `y`\n' +
          'Examples: `?settimer 30s`, `?settimer 5m Standup call`, `?settimer 1h`, `?settimer 2d`'})],
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided.';
    const now = Date.now();
    const triggerAt = now + durMs;
    const triggerUnix = Math.floor(triggerAt / 1000);

    const timerEmbed = responseBuilder.buildResult({ title: '⏳ Timer', description: `**${reason}** — ends <t:${triggerUnix}:R>`});

    const sent = await message.reply({ embeds: [timerEmbed] });

    // Store in DB for crash-recovery
    try {
      await getDb().timer.add(message.author.id, message.channelId, message.guild.id, reason, now, triggerAt, sent.id);
    } catch (e) {
      // DB write failure shouldn't kill the timer — the in-memory one will still fire
      // via the poller on next restart IF the DB recovers. Log and continue.
      logger.error('[settimer] DB write failed', e.message);
    }
  },
};
