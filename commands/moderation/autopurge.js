// src/commands/moderation/autopurge.js
// Toggle an auto-purge loop on a channel: every N seconds, delete messages older than M.
// Stored in-memory; restarts on bot restart.

const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

const loops = new Map(); // channelId -> intervalId

module.exports = {
  name: 'autopurge',
  category: 'moderation',
  aliases: ['apg'],
  description: 'Auto-purge messages older than N seconds every M seconds. Usage: autopurge <on|off> <maxAgeSeconds> [intervalSeconds]',
  usage: '<on|off> <maxAgeSeconds> [intervalSeconds=60]',
  cooldown: 5,
  permissions: ['ManageMessages', 'ManageGuild'],
  args: true,
  async execute(message, args) {
    const mode = (args[0] || '').toLowerCase();
    if (mode === 'off') {
      const id = loops.get(message.channelId);
      if (id) { clearInterval(id); loops.delete(message.channelId); }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('Auto-purge stopped for this channel.')] });
    }
    if (mode !== 'on') return message.reply('Usage: `autopurge on <maxAgeSeconds> [intervalSeconds]` or `autopurge off`.');
    const maxAge = parseInt(args[1], 10);
    const interval = parseInt(args[2], 10) || 60;
    if (!maxAge || maxAge < 5) return message.reply('maxAgeSeconds must be >= 5.');
    if (loops.has(message.channelId)) clearInterval(loops.get(message.channelId));
    const id = setInterval(async () => {
      try {
        const cutoff = Date.now() - maxAge * 1000;
        const fetched = await message.channel.messages.fetch({ limit: 50 });
        const old = fetched.filter((m) => m.createdTimestamp < cutoff && !m.pinned);
        if (old.size) await message.channel.bulkDelete(old, true).catch(() => {});
      } catch (e) { logger.debug(`autopurge ${message.channelId}: ${e.message}`); }
    }, interval * 1000);
    loops.set(message.channelId, id);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Auto-purge ON — messages older than ${maxAge}s removed every ${interval}s.`)] });
  },
};
