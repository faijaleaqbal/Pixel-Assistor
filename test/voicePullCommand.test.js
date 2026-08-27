// test/voicePullCommand.test.js
// Unit tests for the .voice command and pull subcommand.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const voiceCmd = require('../commands/moderation/voice');
const { init } = require('../utils/db');

describe('Voice Command & Subcommands Suite', () => {
  let replyPayload = null;
  let targetSetChannelParam = null;

  const mockChannel = {
    id: 'voice_chan_author',
    name: 'General Voice',
  };

  const mockTargetChannel = {
    id: 'voice_chan_target',
    name: 'Gaming Lounge',
    members: new Map(),
  };

  const createMockTarget = (inVoice = true, channelId = 'voice_chan_target') => {
    const targetId = '123456789012345678';
    return {
      id: targetId,
      user: {
        id: targetId,
        tag: 'Target#1111',
      },
      voice: {
        channel: inVoice ? (channelId === 'voice_chan_author' ? mockChannel : mockTargetChannel) : null,
        channelId: inVoice ? channelId : null,
        setChannel: (chan) => {
          targetSetChannelParam = chan;
          return Promise.resolve();
        },
        disconnect: () => Promise.resolve(),
        setMute: () => Promise.resolve(),
        setDeaf: () => Promise.resolve(),
      },
    };
  };

  const createMockMsg = ({ authorInVoice = true, targetMember = null, botHasPerms = true } = {}) => {
    return {
      guild: {
        id: 'guild_voice_test_123',
        name: 'Voice Guild',
        members: {
          me: {
            id: 'bot_123',
            permissions: {
              has: (flag) => botHasPerms,
            },
          },
          fetch: async (id) => targetMember,
        },
      },
      member: {
        id: 'author_123',
        voice: {
          channel: authorInVoice ? mockChannel : null,
          channelId: authorInVoice ? mockChannel.id : null,
        },
      },
      author: {
        id: 'author_123',
        tag: 'Author#0001',
      },
      mentions: {
        users: targetMember ? new Map([[targetMember.id, targetMember.user]]) : new Map(),
        members: targetMember ? new Map([[targetMember.id, targetMember]]) : new Map(),
      },
      client: {
        users: {
          fetch: async (id) => targetMember?.user,
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
    targetSetChannelParam = null;
    await init();
  });

  it('1. .voice pull fails if command author is not in a voice channel', async () => {
    const target = createMockTarget(true);
    const msg = createMockMsg({ authorInVoice: false, targetMember: target });

    await voiceCmd.execute(msg, ['pull', target.id], {});

    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('You need to be in a voice channel'));
    assert.equal(targetSetChannelParam, null);
  });

  it('2. .voice pull fails if target user is not in a voice channel', async () => {
    const target = createMockTarget(false);
    const msg = createMockMsg({ authorInVoice: true, targetMember: target });

    await voiceCmd.execute(msg, ['pull', target.id], {});

    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('That user is not in a voice channel'));
    assert.equal(targetSetChannelParam, null);
  });

  it('3. .voice pull successfully moves target member to author voice channel', async () => {
    const target = createMockTarget(true, 'voice_chan_target');
    const msg = createMockMsg({ authorInVoice: true, targetMember: target });

    await voiceCmd.execute(msg, ['pull', target.id], {});

    assert.ok(targetSetChannelParam);
    assert.equal(targetSetChannelParam.id, 'voice_chan_author');

    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Moved') && raw.includes('Target#1111') && raw.includes('General Voice'));
  });

  it('4. .voice with no args outputs all voice subcommands help list', async () => {
    const msg = createMockMsg({ authorInVoice: true });

    await voiceCmd.execute(msg, [], {});

    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Voice Subcommands'));
    assert.ok(raw.includes('voice pull'));
    assert.ok(raw.includes('voice kick'));
  });
});
