// src/utils/snipeCache.js
// In-memory snipe cache. Keeps last N deleted/edited messages per channel.
// Memory-bounded — won't grow unboundedly.

const MAX_PER_CHANNEL = 10;
const deleted = new Map(); // channelId -> [{ author, content, time, attachment }]
const edited = new Map();

function push(map, channelId, entry) {
  if (!map.has(channelId)) map.set(channelId, []);
  const list = map.get(channelId);
  list.unshift(entry);
  if (list.length > MAX_PER_CHANNEL) list.length = MAX_PER_CHANNEL;
}

function pushDeleted(message) {
  push(deleted, message.channelId, {
    author: message.author,
    content: message.content,
    time: Date.now(),
    attachment: message.attachments?.first()?.url || null,
    channelId: message.channelId,
  });
}

function pushEdited(oldMsg, newMsg) {
  push(edited, oldMsg.channelId, {
    author: oldMsg.author,
    before: oldMsg.content,
    after: newMsg.content,
    time: Date.now(),
  });
}

function getDeleted(channelId, n = 1) {
  const list = deleted.get(channelId) || [];
  return list.slice(0, n);
}

function getEdited(channelId, n = 1) {
  const list = edited.get(channelId) || [];
  return list.slice(0, n);
}

function clearDeleted(channelId) { deleted.delete(channelId); }
function clearEdited(channelId) { edited.delete(channelId); }

module.exports = { pushDeleted, pushEdited, getDeleted, getEdited, clearDeleted, clearEdited };
