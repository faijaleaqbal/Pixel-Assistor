// test/interactionHelper.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  safeReply,
  safeEditReply,
  safeFollowUp,
  safeDeferReply,
  isIgnorableError,
} = require('../utils/interactionHelper');

describe('Safe Interaction Helper', () => {
  it('isIgnorableError correctly identifies benign Discord interaction race errors', () => {
    assert.equal(isIgnorableError({ code: 10062 }), true);
    assert.equal(isIgnorableError({ code: 40060 }), true);
    assert.equal(isIgnorableError({ code: 50027 }), true);
    assert.equal(isIgnorableError(new Error('Unknown interaction')), true);
    assert.equal(isIgnorableError(new Error('Interaction has already been acknowledged.')), true);
    assert.equal(isIgnorableError(new Error('DiscordAPIError: Missing Permissions')), false);
  });

  it('safeReply: delegates to reply when unacknowledged', async () => {
    let replyCalledWith = null;
    const mockInteraction = {
      replied: false,
      deferred: false,
      reply: async (opts) => {
        replyCalledWith = opts;
        return { id: 'msg_1' };
      },
    };

    await safeReply(mockInteraction, { content: 'Hello' });
    assert.deepEqual(replyCalledWith, { content: 'Hello' });
  });

  it('safeReply: delegates to editReply when already deferred', async () => {
    let editCalledWith = null;
    const mockInteraction = {
      replied: false,
      deferred: true,
      editReply: async (opts) => {
        editCalledWith = opts;
        return { id: 'msg_2' };
      },
    };

    await safeReply(mockInteraction, { content: 'Deferred hello' });
    assert.deepEqual(editCalledWith, { content: 'Deferred hello' });
  });

  it('safeReply: delegates to followUp when already replied', async () => {
    let followUpCalledWith = null;
    const mockInteraction = {
      replied: true,
      deferred: false,
      followUp: async (opts) => {
        followUpCalledWith = opts;
        return { id: 'msg_3' };
      },
    };

    await safeReply(mockInteraction, { content: 'Follow up hello' });
    assert.deepEqual(followUpCalledWith, { content: 'Follow up hello' });
  });

  it('safeReply: swallows ignorable Discord interaction expired errors without throwing', async () => {
    const errorInteraction = {
      replied: false,
      deferred: false,
      reply: async () => {
        const err = new Error('Unknown interaction');
        err.code = 10062;
        throw err;
      },
    };

    const res = await safeReply(errorInteraction, { content: 'Expired test' });
    assert.equal(res, null);
  });

  it('safeEditReply & safeFollowUp & safeDeferReply execute safely', async () => {
    let deferred = false;
    const mockInt = {
      replied: false,
      deferred: false,
      deferReply: async () => { deferred = true; },
      editReply: async (opts) => opts,
      followUp: async (opts) => opts,
      reply: async (opts) => opts,
    };

    await safeDeferReply(mockInt);
    assert.equal(deferred, true);
    mockInt.deferred = true;

    const editRes = await safeEditReply(mockInt, { content: 'edited' });
    assert.deepEqual(editRes, { content: 'edited' });

    const followRes = await safeFollowUp(mockInt, { content: 'followed' });
    assert.deepEqual(followRes, { content: 'followed' });
  });
});
