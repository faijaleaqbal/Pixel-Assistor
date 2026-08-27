// test/cloneCommand.test.js
// Unit tests for the .clone command.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const cloneCmd = require('../commands/moderation/clone');

describe('Clone Command Suite', () => {
  let replyPayload = null;
  let clonedOptions = null;

  const mockChannel = {
    id: 'chan_original_123',
    name: 'general-chat',
    clone: (options) => {
      clonedOptions = options;
      return Promise.resolve({
        id: 'chan_cloned_456',
        name: options?.name || 'general-chat',
      });
    },
  };

  const mockMessage = {
    channel: mockChannel,
    mentions: {
      channels: {
        first: () => null,
      },
    },
    guild: {
      id: 'guild_123',
      ownerId: 'admin_123',
      members: {
        me: {
          id: 'bot_123',
          permissions: {
            has: () => true,
          },
        },
      },
    },
    author: {
      tag: 'Admin#0001',
      id: 'admin_123',
    },
    member: {
      permissions: {
        has: () => true,
      },
    },
    reply: (payload) => {
      replyPayload = payload;
      return Promise.resolve();
    },
  };

  beforeEach(() => {
    replyPayload = null;
    clonedOptions = null;
    mockMessage.mentions.channels = { first: () => null };
  });

  it('1. Clones channel directly without confirmation and with exact original name', async () => {
    await cloneCmd.execute(mockMessage, [], {});
    assert.ok(replyPayload);
    assert.ok(clonedOptions);

    // Exact name should match original, without "-clone" suffix
    assert.equal(clonedOptions.name, 'general-chat');
    assert.equal(clonedOptions.name.includes('-clone'), false);

    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('chan_cloned_456'));
    assert.ok(raw.includes('general-chat'));
  });

  it('2. Clones mentioned channel with exact mentioned channel name', async () => {
    const mentionedChan = {
      id: 'chan_announcements_789',
      name: 'announcements',
      clone: (options) => {
        clonedOptions = options;
        return Promise.resolve({
          id: 'chan_cloned_999',
          name: options?.name || 'announcements',
        });
      },
    };

    mockMessage.mentions.channels = {
      first: () => mentionedChan,
    };

    await cloneCmd.execute(mockMessage, ['<#chan_announcements_789>'], {});
    assert.ok(clonedOptions);
    assert.equal(clonedOptions.name, 'announcements');
    assert.equal(clonedOptions.name.includes('-clone'), false);
  });

  it('3. Allows custom new name when explicitly provided as argument', async () => {
    await cloneCmd.execute(mockMessage, ['new-room'], {});
    assert.ok(clonedOptions);
    assert.equal(clonedOptions.name, 'new-room');
  });
});
