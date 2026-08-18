// test/purgeCommand.test.js
// Comprehensive unit tests for the production Purge command.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField } = require('discord.js');
const purgeCmd = require('../commands/moderation/purge');

function createMockMessage(id, createdTimestamp, isBot = false, authorId = 'user1') {
  return {
    id: `msg_${id}`,
    createdTimestamp,
    author: {
      id: authorId,
      bot: isBot,
    },
  };
}

function createMockChannel(messagesList = []) {
  const msgs = [...messagesList];

  return {
    messagesList: msgs,
    messages: {
      fetch: async ({ limit = 100, before = null } = {}) => {
        let pool = [...msgs];
        if (before) {
          const idx = pool.findIndex((m) => m.id === before);
          if (idx !== -1) {
            pool = pool.slice(idx + 1);
          }
        }
        const slice = pool.slice(0, limit);
        const map = new Map();
        for (const m of slice) {
          map.set(m.id, m);
        }
        return {
          size: map.size,
          first: (n) => (n ? Array.from(map.values()).slice(0, n) : Array.from(map.values())[0]),
          last: () => Array.from(map.values())[map.size - 1],
          values: () => map.values(),
          filter: (fn) => {
            const sub = new Map();
            for (const [k, v] of map.entries()) {
              if (fn(v)) sub.set(k, v);
            }
            return {
              size: sub.size,
              values: () => sub.values(),
              filter: (fn2) => {
                const sub2 = new Map();
                for (const [k2, v2] of sub.entries()) {
                  if (fn2(v2)) sub2.set(k2, v2);
                }
                return {
                  size: sub2.size,
                  values: () => sub2.values(),
                };
              },
            };
          },
        };
      },
    },
    bulkDelete: async (deletable, filterOld) => {
      const arr = Array.isArray(deletable) ? deletable : Array.from(deletable.values ? deletable.values() : deletable);
      const toDeleteIds = new Set(arr.map((m) => m.id));
      const deleted = msgs.filter((m) => toDeleteIds.has(m.id));
      for (const d of deleted) {
        const idx = msgs.indexOf(d);
        if (idx !== -1) msgs.splice(idx, 1);
      }
      return { size: deleted.length };
    },
    send: async (payload) => {
      return {
        ...payload,
        id: 'confirm_msg_1',
        delete: async () => {},
      };
    },
    permissionsFor: (member) => {
      return {
        has: (perm) => {
          if (member?.lacksPerms) return false;
          return true;
        },
      };
    },
  };
}

describe('Purge Command Unit & Integration Tests', () => {
  it('Validates command metadata structure', () => {
    assert.equal(purgeCmd.name, 'purge');
    assert.equal(purgeCmd.category, 'moderation');
    assert.ok(purgeCmd.permissions.includes('ManageMessages'));
    assert.equal(typeof purgeCmd.execute, 'function');
  });

  it('Normal purge: deletes exact requested number of messages', async () => {
    const now = Date.now();
    const mockMessages = [];
    for (let i = 1; i <= 20; i++) {
      mockMessages.push(createMockMessage(i, now - i * 1000));
    }

    const channel = createMockChannel(mockMessages);
    const { totalDeleted, hitAgeLimit } = await purgeCmd.purgeMessages(channel, 7, () => true);

    assert.equal(totalDeleted, 7, 'Should delete exactly 7 messages');
    assert.equal(hitAgeLimit, false);
    assert.equal(channel.messagesList.length, 13, '13 messages should remain in channel');
  });

  it('Large purge (>100 messages): handles batching across multiple pages', async () => {
    const now = Date.now();
    const mockMessages = [];
    for (let i = 1; i <= 250; i++) {
      mockMessages.push(createMockMessage(i, now - i * 500));
    }

    const channel = createMockChannel(mockMessages);
    const { totalDeleted } = await purgeCmd.purgeMessages(channel, 150, () => true);

    assert.equal(totalDeleted, 150, 'Should delete exactly 150 messages across batches');
    assert.equal(channel.messagesList.length, 100, '100 messages should remain');
  });

  it('Age limit safety: skips messages older than 14 days and detects hitAgeLimit', async () => {
    const now = Date.now();
    const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
    const mockMessages = [
      createMockMessage(1, now - 1000),             // Recent
      createMockMessage(2, now - 2000),             // Recent
      createMockMessage(3, now - FIFTEEN_DAYS_MS), // Old (>14d)
      createMockMessage(4, now - FIFTEEN_DAYS_MS), // Old (>14d)
    ];

    const channel = createMockChannel(mockMessages);
    const { totalDeleted, hitAgeLimit } = await purgeCmd.purgeMessages(channel, 10, () => true);

    assert.equal(totalDeleted, 2, 'Should only delete the 2 recent messages');
    assert.equal(hitAgeLimit, true, 'Should indicate age limit reached');
  });

  it('Filters by bot and human author types', async () => {
    const now = Date.now();
    const mockMessages = [
      createMockMessage(1, now - 1000, true),  // bot
      createMockMessage(2, now - 2000, false), // human
      createMockMessage(3, now - 3000, true),  // bot
      createMockMessage(4, now - 4000, false), // human
      createMockMessage(5, now - 5000, false), // human
    ];

    // Purge only bots
    const channelBot = createMockChannel(mockMessages);
    const resBot = await purgeCmd.purgeMessages(channelBot, 10, (m) => m.author.bot);
    assert.equal(resBot.totalDeleted, 2, 'Should delete only the 2 bot messages');

    // Purge only humans
    const channelHuman = createMockChannel(mockMessages);
    const resHuman = await purgeCmd.purgeMessages(channelHuman, 10, (m) => !m.author.bot);
    assert.equal(resHuman.totalDeleted, 3, 'Should delete only the 3 human messages');
  });

  it('Command execution validates invalid amounts (0, negative, strings, float, >1000)', async () => {
    const invalidInputs = ['0', '-5', 'abc', '3.5', '1500'];

    for (const input of invalidInputs) {
      let replied = null;
      const mockMsg = {
        guild: { members: { me: {} } },
        channel: createMockChannel([]),
        member: {},
        delete: async () => {},
        reply: async (payload) => {
          replied = payload;
        },
      };

      await purgeCmd.execute(mockMsg, [input]);
      assert.ok(replied, `Should reply with error for invalid input: ${input}`);
      const desc = replied.embeds?.[0]?.data?.description || '';
      assert.match(desc, /❌|Invalid/);
    }
  });

  it('Rejects execution when user lacks ManageMessages permission', async () => {
    let replied = null;
    const mockChannel = createMockChannel([]);
    mockChannel.permissionsFor = (member) => ({
      has: () => (member?.isBot ? true : false),
    });

    const mockMsg = {
      guild: { members: { me: { isBot: true } } },
      channel: mockChannel,
      member: { isBot: false },
      delete: async () => {},
      reply: async (payload) => {
        replied = payload;
      },
    };

    await purgeCmd.execute(mockMsg, ['10']);
    assert.ok(replied);
    assert.match(replied.embeds[0].data.description, /You need the \*\*Manage Messages\*\* permission/);
  });

  it('Rejects execution when bot lacks ManageMessages permission', async () => {
    let replied = null;
    const mockChannel = createMockChannel([]);
    mockChannel.permissionsFor = (member) => ({
      has: () => (member?.isBot ? false : true),
    });

    const mockMsg = {
      guild: { members: { me: { isBot: true } } },
      channel: mockChannel,
      member: { isBot: false },
      delete: async () => {},
      reply: async (payload) => {
        replied = payload;
      },
    };

    await purgeCmd.execute(mockMsg, ['10']);
    assert.ok(replied);
    assert.match(replied.embeds[0].data.description, /I do not have the \*\*Manage Messages\*\* permission/);
  });

  it('Handles Discord API bulkDelete error gracefully without crashing', async () => {
    const channel = createMockChannel([createMockMessage(1, Date.now())]);
    channel.bulkDelete = async () => {
      throw new Error('DiscordAPIError[50013]: Missing Permissions');
    };

    const res = await purgeCmd.purgeMessages(channel, 5, () => true);
    assert.equal(res.totalDeleted, 0);
  });
});
