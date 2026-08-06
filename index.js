// src/index.js
// Entry point. Boots the Discord client, loads commands + events, starts the
// reminder poller, and wires a global error catch.

const { Client, GatewayIntentBits, Partials, Options, ActivityType } = require('discord.js');
const config = require('./utils/config');
const logger = require('./utils/logger');
const { init: dbInit } = require('./utils/db');
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

// Load commands + events BEFORE login so 'ready' listeners registered by the
// event handler actually fire when the gateway sends READY. Previously these
// were loaded inside the ready handler, which made events/ready.js dead code
// and risked dropping early events.
commandHandler.load(client);
eventHandler.load(client);

client.once('ready', async () => {
  logger.success(`Logged in as ${client.user.tag}`);
  try { await dbInit(); } catch (e) { logger.error('DB init failed', e.message); }
  // Persist reminder poller
  require('./utils/reminderPoller').start(client);
  // Bot presence
  client.user.setActivity(`?help • ${client.guilds.cache.size} guilds`, { type: ActivityType.Watching });
});

// Global error guards so the process never dies on a single rejection.
process.on('unhandledRejection', (r) => logger.error('unhandledRejection', r?.message || r));
process.on('uncaughtException', (e) => {
  logger.error('uncaughtException', e?.stack || e?.message || e);
  // Don't exit automatically — let pm2/systemd/Termux restart on real crashes.
  // If the error is unrecoverable, the user can manually restart.
});

client.login(config.token);
