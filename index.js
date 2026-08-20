// src/index.js
// Production entry point. Boots the Discord client, loads commands + events,
// initializes database, starts background pollers, and manages graceful shutdowns.

const { Client, GatewayIntentBits, Partials, Options } = require('discord.js');
const config = require('./utils/config');
const logger = require('./utils/logger');
const { init: dbInit, getDb } = require('./utils/db');
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

async function bootstrap() {
  try {
    // 1. Initialize Database first
    await dbInit();

    // 2. Load commands + events
    commandHandler.load(client);
    eventHandler.load(client);

    // 3. Connect to Discord Gateway
    await client.login(config.token);
  } catch (err) {
    logger.error('FATAL bootstrap error — exiting for supervisor restart:', err?.stack || err?.message || err);
    process.exit(1);
  }
}

// Global error guards
process.on('unhandledRejection', (r) => logger.error('unhandledRejection', r?.stack || r?.message || r));
process.on('uncaughtException', (e) => {
  logger.error('FATAL uncaughtException — exiting for supervisor restart:', e?.stack || e?.message || e);
  process.exit(1);
});

// Graceful shutdown
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}. Shutting down cleanly...`);
  try {
    if (client) client.destroy();
    const db = getDb();
    if (db && typeof db.close === 'function') {
      await db.close();
    }
  } catch (err) {
    logger.debug('Error during shutdown:', err?.message);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap();
