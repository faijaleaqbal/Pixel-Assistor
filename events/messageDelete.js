// src/events/messageDelete.js
// Captures deleted messages into an in-memory snipe cache (per-channel, last 10).

const snipe = require('../utils/snipeCache');

module.exports = {
  name: 'messageDelete',
  execute(message) {
    if (message.author?.bot || !message.content) return;
    snipe.pushDeleted(message);
  },
};
