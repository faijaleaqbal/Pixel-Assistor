// test/stealCommand.test.js
// Unit tests for the .steal and .addemoji commands.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const stealCmd = require('../commands/moderation/steal');
const addemojiCmd = require('../commands/moderation/addemoji');
const { init, getDb } = require('../utils/db');

describe('Steal & AddEmoji Command Suite (Krypton Style)', () => {
  let replyPayload = null;
  let createdEmojiParams = null;

  const mockGuild = {
    id: 'guild_steal_test_123',
    name: 'Steal Test Guild',
    emojis: {
      create: (params) => {
        createdEmojiParams = params;
        return Promise.resolve({
          id: '999111222333444555',
          name: params.name,
          toString: () => `<:${params.name}:999111222333444555>`,
        });
      },
    },
  };

  const createMockMsg = ({ content = '', args = [], attachments = [], reference = null } = {}) => {
    return {
      channelId: 'chan_123',
      guild: mockGuild,
      content,
      author: {
        id: 'user_123',
        tag: 'Tester#0001',
      },
      attachments: {
        first: () => attachments[0] || null,
      },
      reference,
      channel: {
        messages: {
          fetch: async (id) => null,
        },
      },
      reply: (payload) => {
        replyPayload = payload;
        return Promise.resolve();
      },
    };
  };

  beforeEach(async () => {
    replyPayload = null;
    createdEmojiParams = null;
    await init();
  });

  it('1. .steal <custom_emoji> extracts name and png/gif URL automatically without name arg', async () => {
    const msg = createMockMsg({
      content: '?steal <:cool_cat:123456789012345678>',
    });

    await stealCmd.execute(msg, ['<:cool_cat:123456789012345678>'], {});

    assert.ok(createdEmojiParams);
    assert.equal(createdEmojiParams.name, 'cool_cat');
    assert.ok(createdEmojiParams.attachment.includes('123456789012345678.png'));

    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Successfully created 1/1 Emojis'));
  });

  it('2. .steal <animated_emoji> extracts name and .gif URL correctly', async () => {
    const msg = createMockMsg({
      content: '?steal <a:fire_spin:987654321098765432>',
    });

    await stealCmd.execute(msg, ['<a:fire_spin:987654321098765432>'], {});

    assert.ok(createdEmojiParams);
    assert.equal(createdEmojiParams.name, 'fire_spin');
    assert.ok(createdEmojiParams.attachment.includes('987654321098765432.gif'));
  });

  it('3. .steal <custom_name> <custom_emoji> overrides the emoji name with custom name', async () => {
    const msg = createMockMsg({
      content: '?steal my_name <:pepe:123456789012345678>',
    });

    await stealCmd.execute(msg, ['my_name', '<:pepe:123456789012345678>'], {});

    assert.ok(createdEmojiParams);
    assert.equal(createdEmojiParams.name, 'my_name');
    assert.ok(createdEmojiParams.attachment.includes('123456789012345678.png'));
  });

  it('4. .steal with image attachment creates emoji using attachment name', async () => {
    const msg = createMockMsg({
      content: '?steal',
      attachments: [{
        name: 'pepe_laugh.png',
        url: 'https://cdn.discordapp.com/attachments/123/456/pepe_laugh.png',
        contentType: 'image/png',
      }],
    });

    await stealCmd.execute(msg, [], {});

    assert.ok(createdEmojiParams);
    assert.equal(createdEmojiParams.name, 'pepe_laugh');
    assert.equal(createdEmojiParams.attachment, 'https://cdn.discordapp.com/attachments/123/456/pepe_laugh.png');
  });

  it('5. .steal with no args, no attachment, no url shows clear usage help', async () => {
    const msg = createMockMsg({ content: '?steal' });

    await stealCmd.execute(msg, [], {});

    assert.equal(createdEmojiParams, null);
    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Please provide a custom emoji, image URL, or attach an image file'));
  });

  it('6. .addemoji works with custom emoji mention', async () => {
    const msg = createMockMsg({ content: '?addemoji <:rocket:555666777888999111>' });

    await addemojiCmd.execute(msg, ['<:rocket:555666777888999111>'], {});

    assert.ok(createdEmojiParams);
    assert.equal(createdEmojiParams.name, 'rocket');
    assert.ok(createdEmojiParams.attachment.includes('555666777888999111.png'));
  });
});
