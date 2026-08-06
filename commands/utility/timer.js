// src/commands/utility/timer.js
// Countdown timer — sends a message when the timer fires.
// Usage: ?timer <seconds>

const { EmbedBuilder } = require('discord.js');
const ms = require('../../utils/ms');

const ok = (t) => new EmbedBuilder().setColor(0x57F287).setDescription(t);
const err = (t) => new EmbedBuilder().setColor(0xED4245).setDescription(t);

module.exports = {
  name: 'timer',
  category: 'utility',
  description: 'Start a countdown timer. Usage: timer <duration>',
  usage: '<duration>',
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const dur = ms.parse(args[0]);
    if (!dur || dur < 1000 || dur > ms.hours(24)) return message.reply({ embeds: [err('Duration must be 1s-24h. Examples: `30s`, `5m`, `1h`.')] });
    const endsAt = Date.now() + dur;
    const sent = await message.reply({ embeds: [ok(`⏱️ Timer set for ${ms.format(dur)}. Ends <t:${Math.floor(endsAt / 1000)}:R>.`)] });
    const handle = setTimeout(() => {
      sent.reply({ content: `<@${message.author.id}> ⏱️ Timer finished!`, embeds: [ok('⏰ Time\'s up.')] }).catch(() => {});
    }, dur);
    // Don't keep the process alive just for this timer during shutdown.
    if (typeof handle.unref === 'function') handle.unref();
  },
};
