// test/ownerCommand.test.js
// Unit & Integration tests for User-based Owner System and Owner-Only Command Restrictions.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ownerCmd = require('../commands/moderation/owner');
const cloneCmd = require('../commands/moderation/clone');
const setprefixCmd = require('../commands/admin/setprefix');
const { init, getDb } = require('../utils/db');
const { isTrustedOwner, isBotOwner, isGuildOwner } = require('../utils/perms');

describe('User-Based Owner System & Security Restrictions', () => {
  let replyPayload = null;
  let db = null;
  const guildId = 'guild_owner_test_999';

  const mockGuild = {
    id: guildId,
    name: 'Pixel Test Guild',
    ownerId: '111111111111111111', // Primary Guild Owner
    roles: {
      cache: new Map(),
    },
    channels: {
      cache: new Map(),
    },
    members: {
      me: {
        id: '999999999999999999',
        roles: { highest: { position: 100 } },
        permissions: { has: () => true },
      },
    },
  };

  const createMockMessage = (authorId, isBot = false) => {
    return {
      channelId: 'chan_123',
      channel: {
        id: 'chan_123',
        clone: () => Promise.resolve({ id: 'chan_clone_123', name: 'general' }),
      },
      guild: mockGuild,
      member: {
        id: authorId,
        permissions: { has: () => true }, // Admin permissions
        roles: { highest: { position: 50 } },
      },
      author: {
        id: authorId,
        bot: isBot,
        tag: `User_${authorId}#0001`,
        send: () => Promise.resolve(),
      },
      mentions: {
        users: new Map(),
        roles: new Map(),
        channels: new Map(),
      },
      client: {
        users: {
          fetch: async (id) => {
            if (id === 'invalid') throw new Error('Unknown User');
            return { id, bot: id === '888888888888888888', tag: `Resolved_${id}#0001` };
          },
        },
      },
      reply: (payload) => {
        replyPayload = payload;
        return Promise.resolve({
          edit: (p) => {
            replyPayload = p;
            return Promise.resolve();
          },
        });
      },
    };
  };

  beforeEach(async () => {
    replyPayload = null;
    db = await init();
    await db.guildConfig.set(guildId, { extraOwners: [] });
  });

  it('1. Non-server-owner cannot run .owner add', async () => {
    const randomUserMsg = createMockMessage('222222222222222222');
    await ownerCmd.execute(randomUserMsg, ['add', '333333333333333333'], {});

    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Only the **Server Owner** can manage the trusted owner list.'));
  });

  it('2. Server owner can add a user by ID and user mention to trusted owners', async () => {
    const ownerMsg = createMockMessage('111111111111111111');
    const targetUserId = '333333333333333333';

    await ownerCmd.execute(ownerMsg, ['add', targetUserId], {});

    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Successful Operations') || raw.includes('Trusted Owner Addition'));
    assert.ok(raw.includes(targetUserId));

    // Verify in DB and permission check
    const isNowOwner = await isTrustedOwner(targetUserId, mockGuild);
    assert.equal(isNowOwner, true);
  });

  it('3. Rejects adding bots, self/owner, or duplicate trusted owners', async () => {
    const ownerMsg = createMockMessage('111111111111111111');

    // Bot check
    await ownerCmd.execute(ownerMsg, ['add', '888888888888888888'], {});
    assert.ok(JSON.stringify(replyPayload).includes('cannot add a bot'));

    // Server owner check
    await ownerCmd.execute(ownerMsg, ['add', '111111111111111111'], {});
    assert.ok(JSON.stringify(replyPayload).includes('already the Server Owner'));

    // Add user first
    await ownerCmd.execute(ownerMsg, ['add', '444444444444444444'], {});
    // Duplicate add
    await ownerCmd.execute(ownerMsg, ['add', '444444444444444444'], {});
    assert.ok(JSON.stringify(replyPayload).includes('already in the trusted owner list'));
  });

  it('4. Lists primary server owner and extra trusted owners correctly', async () => {
    const ownerMsg = createMockMessage('111111111111111111');
    await db.guildConfig.set(guildId, { extraOwners: ['555555555555555555'] });

    await ownerCmd.execute(ownerMsg, ['list'], {});
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('111111111111111111'));
    assert.ok(raw.includes('555555555555555555'));
  });

  it('5. Removes user from trusted owners and resets owner list', async () => {
    const ownerMsg = createMockMessage('111111111111111111');
    await db.guildConfig.set(guildId, { extraOwners: ['666666666666666666'] });

    await ownerCmd.execute(ownerMsg, ['remove', '666666666666666666'], {});
    let isOwnerCheck = await isTrustedOwner('666666666666666666', mockGuild);
    assert.equal(isOwnerCheck, false);

    // Reset check
    await db.guildConfig.set(guildId, { extraOwners: ['777777777777777777'] });
    await ownerCmd.execute(ownerMsg, ['reset'], {});
    isOwnerCheck = await isTrustedOwner('777777777777777777', mockGuild);
    assert.equal(isOwnerCheck, false);
  });

  it('6. High-level commands (.setprefix, .clone) reject non-trusted members but allow trusted owners', async () => {
    const nonTrustedMsg = createMockMessage('222222222222222222');
    const trustedMsg = createMockMessage('333333333333333333');

    // Add 333333333333333333 to trusted owners
    await db.guildConfig.set(guildId, { extraOwners: ['333333333333333333'] });

    // Non-trusted member tries setprefix
    replyPayload = null;
    await setprefixCmd.execute(nonTrustedMsg, ['!'], {});
    assert.ok(JSON.stringify(replyPayload).includes('Access Denied'));

    // Trusted owner tries setprefix
    replyPayload = null;
    await setprefixCmd.execute(trustedMsg, ['!'], {});
    assert.ok(JSON.stringify(replyPayload).includes('Prefix Updated'));

    // Non-trusted member tries clone
    replyPayload = null;
    await cloneCmd.execute(nonTrustedMsg, [], {});
    assert.ok(JSON.stringify(replyPayload).includes('Access Denied'));

    // Trusted owner tries clone
    replyPayload = null;
    await cloneCmd.execute(trustedMsg, [], {});
    assert.ok(JSON.stringify(replyPayload).includes('Channel Cloned') || JSON.stringify(replyPayload).includes('cloned'));
  });
});
