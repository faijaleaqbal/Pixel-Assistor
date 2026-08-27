// test/exportCommand.test.js
// Unit tests for the .export command.

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const exportCmd = require('../commands/moderation/export');
const discordTranscripts = require('discord-html-transcripts');

describe('Export Command Suite', () => {
  let replyPayload = null;
  let statusEditPayload = null;
  let dmPayload = null;

  const mockChannel = {
    id: 'chan_test_123',
    name: 'general',
  };

  const mockStatusMsg = {
    edit: (payload) => {
      statusEditPayload = payload;
      return Promise.resolve(mockStatusMsg);
    },
  };

  const mockMessage = {
    channelId: 'chan_test_123',
    channel: mockChannel,
    guild: {
      id: 'guild_123',
      name: 'Pixel Server',
      ownerId: 'user_123',
    },
    author: {
      id: 'user_123',
      tag: 'User#1234',
      send: (payload) => {
        dmPayload = payload;
        return Promise.resolve();
      },
    },
    reply: (payload) => {
      replyPayload = payload;
      return Promise.resolve(mockStatusMsg);
    },
  };

  beforeEach(() => {
    replyPayload = null;
    statusEditPayload = null;
    dmPayload = null;
  });

  it('1. Successfully generates transcript, attaches AttachmentBuilder, and sends to DM', async () => {
    mock.method(discordTranscripts, 'createTranscript', async () => {
      return Buffer.from('<html><body>Hello Transcript</body></html>');
    });

    await exportCmd.execute(mockMessage, ['50'], {});

    assert.ok(replyPayload);
    assert.ok(dmPayload);
    assert.ok(statusEditPayload);

    // Verify DM payload contains the HTML attachment
    assert.ok(dmPayload.files && dmPayload.files.length === 1);
    const att = dmPayload.files[0];
    assert.ok(att.name.endsWith('.html'));

    // Status message was updated with success
    const rawStatus = JSON.stringify(statusEditPayload);
    assert.ok(rawStatus.includes('Transcript Exported') || rawStatus.includes('sent it to your DMs'));

    mock.reset();
  });

  it('2. Gracefully handles closed DMs (code 50007) and informs the user in channel', async () => {
    mock.method(discordTranscripts, 'createTranscript', async () => {
      return Buffer.from('<html><body>Transcript</body></html>');
    });

    mockMessage.author.send = () => {
      const err = new Error('Cannot send messages to this user');
      err.code = 50007;
      return Promise.reject(err);
    };

    await exportCmd.execute(mockMessage, ['20'], {});

    assert.ok(statusEditPayload);
    const rawStatus = JSON.stringify(statusEditPayload);
    assert.ok(rawStatus.includes("Couldn't DM you the transcript"));
    assert.ok(rawStatus.includes('Direct Messages'));

    mock.reset();
  });

  it('3. Handles transcript generation errors and displays error message', async () => {
    mock.method(discordTranscripts, 'createTranscript', async () => {
      throw new Error('Missing access to message history');
    });

    mockMessage.author.send = () => Promise.resolve();

    await exportCmd.execute(mockMessage, ['10'], {});

    assert.ok(statusEditPayload);
    const rawStatus = JSON.stringify(statusEditPayload);
    assert.ok(rawStatus.includes('Transcript Generation Failed'));
    assert.ok(rawStatus.includes('Missing access to message history'));

    mock.reset();
  });
});
