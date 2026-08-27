// test/autopurge.test.js
// Unit tests for the autopurge command.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const autopurgeCmd = require('../commands/moderation/autopurge');

describe('Auto-Purge Command Suite', () => {
  const channelId = 'test_chan_123';
  let replyPayload = null;

  const mockChannel = {
    id: channelId,
    isTextBased: () => true,
    permissionsFor: () => ({
      has: () => true,
    }),
    messages: {
      fetch: () => Promise.resolve(new Map()),
      bulkDelete: () => Promise.resolve(new Map()),
    },
  };

  const mockMessage = {
    channelId,
    channel: mockChannel,
    guild: {
      id: 'guild_123',
      members: {
        me: { id: 'bot_123' },
      },
    },
    reply: (payload) => {
      replyPayload = payload;
      return Promise.resolve();
    },
  };

  const mockClient = {
    channels: {
      cache: new Map([[channelId, mockChannel]]),
      fetch: () => Promise.resolve(mockChannel),
    },
  };

  beforeEach(() => {
    replyPayload = null;
    autopurgeCmd.stopLoop(channelId);
  });

  it('1. Status shows disabled when no auto-purge is running', async () => {
    await autopurgeCmd.execute(mockMessage, ['status'], mockClient);
    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('disabled') || raw.includes('Auto-Purge Status'));
  });

  it('2. Rejects maxAge < 5 seconds', async () => {
    await autopurgeCmd.execute(mockMessage, ['on', '3', '60'], mockClient);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Invalid Max Age') || raw.includes('greater than or equal to'));
  });

  it('3. Rejects maxAge > 14 days (1209600s)', async () => {
    await autopurgeCmd.execute(mockMessage, ['on', '2000000', '60'], mockClient);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Age Limit Exceeded') || raw.includes('14 days'));
  });

  it('4. Rejects interval < 10 seconds to protect rate limits', async () => {
    await autopurgeCmd.execute(mockMessage, ['on', '300', '5'], mockClient);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Invalid Interval') || raw.includes('at least **10 seconds**'));
  });

  it('5. Successfully enables auto-purge with valid parameters', async () => {
    await autopurgeCmd.execute(mockMessage, ['on', '300', '30'], mockClient);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Auto-Purge Enabled') || raw.includes('ON'));
    assert.ok(autopurgeCmd.loops.has(channelId));

    const loop = autopurgeCmd.loops.get(channelId);
    assert.equal(loop.maxAge, 300);
    assert.equal(loop.interval, 30);
  });

  it('6. Status shows active details when running', async () => {
    await autopurgeCmd.execute(mockMessage, ['on', '600', '60'], mockClient);
    await autopurgeCmd.execute(mockMessage, ['status'], mockClient);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Auto-Purge Active'));
    assert.ok(raw.includes('600s'));
  });

  it('7. Successfully turns off auto-purge', async () => {
    await autopurgeCmd.execute(mockMessage, ['on', '300', '30'], mockClient);
    assert.ok(autopurgeCmd.loops.has(channelId));

    await autopurgeCmd.execute(mockMessage, ['off'], mockClient);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Auto-Purge Stopped'));
    assert.equal(autopurgeCmd.loops.has(channelId), false);
  });
});
