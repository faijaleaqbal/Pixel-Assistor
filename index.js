// src/index.js
// Entry point. Boots the Discord client, loads commands + events, starts the
// reminder poller, and wires a global error catch.

const { Client, GatewayIntentBits, Partials, Options } = require('discord.js');
const config = require('./utils/config');
const logger = require('./utils/logger');
const commandHandler = require('./handlers/commandHandler');
const eventHandler = require('./handlers/eventHandler');

if (!config.token) {
  logger.error('TOKEN is missing. Fill in .env (see .env.example) and restart.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildExpressions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember],
  sweepers: Options.DefaultSweepers,
});

// Load commands + events BEFORE login so event listeners
// actually fire when the gateway connects.
commandHandler.load(client);
eventHandler.load(client);

// Global error guards. Unhandled rejections are logged; fatal uncaught exceptions
// log details and exit cleanly with code 1 so PM2/systemd can restart a healthy process.
process.on('unhandledRejection', (r) => logger.error('unhandledRejection', r?.stack || r?.message || r));
process.on('uncaughtException', (e) => {
  logger.error('FATAL uncaughtException — exiting for supervisor restart:', e?.stack || e?.message || e);
  process.exit(1);
});

// Graceful shutdown on termination signals
async function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down cleanly...`);
  try {
    if (client) client.destroy();
    const { getDb } = require('./utils/db');
    const db = getDb();
    if (db && typeof db.close === 'function') {
      await db.close();
    }
  } catch {
    /* ignore shutdown error */
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.token);
