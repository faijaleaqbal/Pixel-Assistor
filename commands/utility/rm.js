// src/commands/utility/rm.js
// Delayed self-reminder. Aliased as ?remindme.
// Usage: ?rm <duration> [reason]  |  ?rm list  |  ?rm cancel <id>
// Duration format: <number><unit>  where unit = s, m, h, d, w, y

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');
const ms = require('../../utils/ms');

module.exports = {
  name: 'rm',
  category: 'utility',
  aliases: ['remindme'],
  description: 'Set a reminder for yourself',
  usage: '<1s/1m/1h/1d/1w/1y> [reason] | list | cancel <id>',
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const db = getDb();
    const sub = args[0]?.toLowerCase();

    // ── ?rm list ──
    if (sub === 'list') {
      const rows = await db.userReminder.list(message.author.id);
      if (!rows.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('You have no pending reminders.')] });
      const fields = rows.slice(0, 15).map((r) => ({
        name: `#${String(r._id).slice(-6)} — <t:${Math.floor(r.triggerAt / 1000)}:R>`,
        value: r.reason || '(no reason)',
        inline: false,
      }));
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('\u23F0 Your reminders').addFields(fields)] });
    }

    // ── ?rm cancel <id> ──
    if (sub === 'cancel') {
      const raw = args[1];
      if (!raw) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a reminder ID. Use `?rm list` to see your reminders.')] });
      // Find by matching the last 6 chars of the _id
      const rows = await db.userReminder.list(message.author.id);
      const match = rows.find(r => String(r._id).slice(-6) === raw.slice(-6));
      if (!match) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`No pending reminder matching "${raw}".`)] });
      await db.userReminder.remove(match._id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`\uD83D\uDDD1\uFE0F Cancelled reminder #${String(match._id).slice(-6)}.`)] });
    }

    // ── ?rm <duration> [reason] ──
    const durMs = ms.parse(sub);
    if (!durMs || durMs < 1000) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          'Invalid duration. Usage: `?rm <duration> [reason]`\n' +
          'Format: `<number><unit>` where unit = `s`, `m`, `h`, `d`, `w`, `y`\n' +
          'Examples: `?rm 30s`, `?rm 5m Check oven`, `?rm 1h`, `?rm 1d`, `?rm 1w`, `?rm 1y Renew domain`'
        )],
      });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided.';
    const now = Date.now();
    const triggerAt = now + durMs;

    // Store in DB first
    let id;
    try {
      id = await db.userReminder.add(message.author.id, message.channelId, message.guild.id, reason, now, triggerAt);
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to save reminder: ${e.message}`)] });
    }

    // Calculate yearly display number
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const displayNum = await db.userReminder.countSince(message.author.id, yearStart);

    // Delete the command message
    await message.delete().catch(() => {});

    // Confirm via DM with yearly number
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`\u23F0 Reminder #${displayNum}`)
      .setDescription(`Reminder set for <t:${Math.floor(triggerAt / 1000)}:R>\n**Reason:** ${reason}`)
      .setFooter({ text: `ID: #${id} • Resets every Jan 1` });

    try {
      await message.author.send({ embeds: [confirmEmbed] });
    } catch {
      // DMs closed — silent since original msg was deleted
    }
  },
};
