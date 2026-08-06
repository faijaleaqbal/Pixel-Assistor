// src/events/messageUpdate.js
// Captures edited messages for editsnipe.

const snipe = require('../utils/snipeCache');

module.exports = {
  name: 'messageUpdate',
  execute(oldMsg, newMsg) {
    if (oldMsg.author?.bot || !oldMsg.content) return;
    if (oldMsg.content === newMsg.content) return;
    snipe.pushEdited(oldMsg, newMsg);
  },
};
