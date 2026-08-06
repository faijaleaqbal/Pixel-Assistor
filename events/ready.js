// src/events/ready.js
const { ActivityType } = require('discord.js');
module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    const log = require('../utils/logger');
    log.success(`Ready: serving ${client.guilds.cache.size} guilds.`);
    // index.js already sets the Watching activity; keep this as a redundant
    // safety net in case index.js's ready handler ever changes.
    try {
      client.user.setActivity(`?help • ${client.guilds.cache.size} guilds`, { type: ActivityType.Watching });
    } catch { /* ignore */ }
  },
};
