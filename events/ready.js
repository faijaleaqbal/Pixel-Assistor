// src/events/ready.js
const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const config = require('../utils/config');
const { init: dbInit } = require('../utils/db');
const reminderPoller = require('../utils/reminderPoller');

module.exports = {
  name: 'ready',
  once: true,
  async execute(readyClient, client) {
    const c = client || readyClient;
    logger.success(`Logged in as ${c.user.tag} — serving ${c.guilds.cache.size} guilds.`);

    try {
      await dbInit();
    } catch (e) {
      logger.error('DB init failed', e?.message || e);
    }

    // Start background reminder & timer poller
    try {
      reminderPoller.start(c);
    } catch (e) {
      logger.error('Failed to start reminder poller', e?.message || e);
    }

    // Set bot presence
    try {
      const defaultPrefix = config.prefix || '?';
      c.user.setActivity(`${defaultPrefix}help • ${c.guilds.cache.size} guilds`, { type: ActivityType.Watching });
    } catch (e) {
      logger.error('Failed to set activity', e?.message || e);
    }
  },
};

