// src/handlers/eventHandler.js
// Loads every .js file in /events. Each event module exports:
//   { name, once, execute(...args, client) }
// We bind to client.on / client.once automatically.

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function load(client) {
  const dir = path.join(__dirname, '..', 'events');
  if (!fs.existsSync(dir)) {
    logger.warn(`events dir missing: ${dir}`);
    return;
  }
  // antinukeHelpers.js is a shared helper module, not an event listener — skip it.
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'antinukeHelpers.js');
  let count = 0;
  for (const file of files) {
    const fp = path.join(dir, file);
    try {
      delete require.cache[require.resolve(fp)];
      const evt = require(fp);
      if (!evt || !evt.name || typeof evt.execute !== 'function') {
        logger.warn(`skipping event ${file}: missing name/execute`);
        continue;
      }
      const binder = evt.once ? client.once.bind(client) : client.on.bind(client);
      binder(evt.name, (...args) => evt.execute(...args, client));
      count++;
    } catch (e) {
      logger.error(`failed loading event ${fp}`, e.message);
    }
  }
  logger.success(`Loaded ${count} events.`);
}

module.exports = { load };
