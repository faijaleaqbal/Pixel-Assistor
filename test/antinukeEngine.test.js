// test/antinukeEngine.test.js
// Unit & Integration tests for the Anti-Nuke Engine & Command.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const antinukeCmd = require('../commands/admin/antinuke');
const { isExempt, punish, sendLog } = require('../events/antinukeHelpers');
const { init, getDb } = require('../utils/db');

describe('Anti-Nuke Protection Engine & Command Suite', () => {
  let replyPayload = null;
  let sentLogPayload = null;
  let bannedTarget = null;
  let kickedTarget = null;
  const guildId = 'guild_antinuke_999';

  const mockGuild = {
    id: guildId,
    name: 'Anti-Nuke Test Server',
    ownerId: '111111111111111111',
    members: {
      me: {
        id: 'bot_999999999999999999',
        roles: { highest: { position: 100 } },
        permissions: { has: () => true },
      },
      fetch: async (id) => {
        return {
          id,
          user: { id, tag: `User_${id}#0001` },
          bannable: true,
          kickable: true,
          roles: {
            cache: new Map([['role_1', { id: 'role_1', position: 10, managed: false }]]),
            remove: () => Promise.resolve(),
          },
          ban: (opts) => {
            bannedTarget = { id, opts };
            return Promise.resolve();
          },
          kick: (reason) => {
            kickedTarget = { id, reason };
            return Promise.resolve();
          },
        };
      },
    },
    channels: {
      cache: new Map([
        [
          'chan_log_123',
          {
            id: 'chan_log_123',
            send: (payload) => {
              sentLogPayload = payload;
              return Promise.resolve();
            },
          },
        ],
      ]),
    },
  };

  const createMockMsg = (authorId) => {
    return {
      channelId: 'chan_log_123',
      channel: mockGuild.channels.cache.get('chan_log_123'),
      guild: mockGuild,
      author: {
        id: authorId,
        tag: `Author_${authorId}#0001`,
      },
      mentions: {
        channels: new Map([['chan_log_123', mockGuild.channels.cache.get('chan_log_123')]]),
        roles: new Map([['role_wl_1', { id: 'role_wl_1', toString: () => '<@&role_wl_1>' }]]),
        users: new Map(),
      },
      client: {
        user: { id: 'bot_999999999999999999' },
        channels: mockGuild.channels,
        users: {
          fetch: async (id) => ({ id, username: `User_${id}` }),
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
    sentLogPayload = null;
    bannedTarget = null;
    kickedTarget = null;
    const db = await init();
    await db.antinuke.set(guildId, {
      enabled: true,
      logChannel: 'chan_log_123',
      punishment: 'ban',
      owners: ['222222222222222222'],
      whitelist: ['333333333333333333'],
      wlRoles: ['role_wl_1'],
    });
    await db.guildConfig.set(guildId, {
      extraOwners: ['444444444444444444'],
    });
  });

  it('1. Anti-nuke correctly exempts server owner, bot, trusted owners, and whitelisted users/roles', async () => {
    const db = getDb();
    const cfg = await db.antinuke.get(guildId);

    // Primary Guild Owner
    assert.equal(await isExempt({ id: '111111111111111111' }, mockGuild, cfg, { user: { id: 'bot_999999999999999999' } }), true);
    // Bot itself
    assert.equal(await isExempt({ id: 'bot_999999999999999999' }, mockGuild, cfg, { user: { id: 'bot_999999999999999999' } }), true);
    // Module owner
    assert.equal(await isExempt({ id: '222222222222222222' }, mockGuild, cfg, { user: { id: 'bot_999999999999999999' } }), true);
    // Whitelisted user
    assert.equal(await isExempt({ id: '333333333333333333' }, mockGuild, cfg, { user: { id: 'bot_999999999999999999' } }), true);
    // Server trusted extra owner
    assert.equal(await isExempt({ id: '444444444444444444' }, mockGuild, cfg, { user: { id: 'bot_999999999999999999' } }), true);
    // Unauthorized attacker
    assert.equal(await isExempt({ id: '666666666666666666' }, mockGuild, cfg, { user: { id: 'bot_999999999999999999' } }), false);
  });

  it('2. Anti-nuke punish executes configured punishment on unauthorized violator', async () => {
    const db = getDb();
    const cfg = await db.antinuke.get(guildId);

    await punish(mockGuild, cfg, { id: '666666666666666666' }, 'Anti-nuke: mass channel delete');

    assert.ok(bannedTarget);
    assert.equal(bannedTarget.id, '666666666666666666');
    assert.equal(bannedTarget.opts.reason, 'Anti-nuke: mass channel delete');
  });

  it('3. .antinuke subcommands configure settings, owners, and whitelists', async () => {
    const ownerMsg = createMockMsg('111111111111111111');
    const db = getDb();

    // Toggle off
    await antinukeCmd.execute(ownerMsg, ['disable'], {});
    let cfg = await db.antinuke.get(guildId);
    assert.equal(cfg.enabled, false);

    // Toggle on
    await antinukeCmd.execute(ownerMsg, ['enable'], {});
    cfg = await db.antinuke.get(guildId);
    assert.equal(cfg.enabled, true);

    // Change punishment
    await antinukeCmd.execute(ownerMsg, ['punishment', 'kick'], {});
    cfg = await db.antinuke.get(guildId);
    assert.equal(cfg.punishment, 'kick');

    // Add whitelist user
    await antinukeCmd.execute(ownerMsg, ['whitelist', 'add', '777777777777777777'], {});
    cfg = await db.antinuke.get(guildId);
    assert.ok(cfg.whitelist.includes('777777777777777777'));

    // Status display
    await antinukeCmd.execute(ownerMsg, ['status'], {});
    assert.ok(replyPayload);
    const raw = JSON.stringify(replyPayload);
    assert.ok(raw.includes('Anti-Nuke — Full Security Settings'));
  });
});
