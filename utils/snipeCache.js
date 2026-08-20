// src/utils/snipeCache.js
// Production-grade bounded in-memory snipe cache.
// Bounded per-channel (max 10 entries) and bounded across channels (max 500 active channels).

const MAX_PER_CHANNEL = 10;
const MAX_CHANNELS = 500;

const deleted = new Map(); // channelId -> [{ author, content, time, attachment }]
const edited = new Map();

function push(map, channelId, entry) {
  if (!map.has(channelId)) {
    if (map.size >= MAX_CHANNELS) {
      // Evict oldest channel
      const oldestKey = map.keys().next().value;
      if (oldestKey) map.delete(oldestKey);
    }
    map.set(channelId, []);
  }
  const list = map.get(channelId);
  list.unshift(entry);
  if (list.length > MAX_PER_CHANNEL) list.length = MAX_PER_CHANNEL;
}

function pushDeleted(message) {
  if (!message || !message.channelId) return;
  push(deleted, message.channelId, {
    author: message.author,
    content: message.content,
    time: Date.now(),
    attachment: message.attachments?.first()?.url || null,
    channelId: message.channelId,
  });
}

function pushEdited(oldMsg, newMsg) {
  if (!oldMsg || !oldMsg.channelId) return;
  push(edited, oldMsg.channelId, {
    author: oldMsg.author,
    before: oldMsg.content,
    after: newMsg?.content || '',
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

function clearDeleted(channelId) {
  deleted.delete(channelId);
}

function clearEdited(channelId) {
  edited.delete(channelId);
}

module.exports = {
  pushDeleted,
  pushEdited,
  getDeleted,
  getEdited,
  clearDeleted,
  clearEdited,
};
