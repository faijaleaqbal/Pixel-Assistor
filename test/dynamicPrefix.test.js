// test/dynamicPrefix.test.js
// Tests for dynamic per-guild prefix support in info, help, and commands.

process.env.DB_SQLITE_PATH = './data/test_prefix.db';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { init, getDb } = require('../utils/db');
const { getPrefix, setPrefix, clearPrefix } = require('../utils/prefixCache');
const infoCmd = require('../commands/utility/info');
const helpCmd = require('../commands/utility/help');
const setprefixCmd = require('../commands/admin/setprefix');
const commandHandler = require('../handlers/commandHandler');
const v2 = require('./helpers/v2');

const TEST_DB = path.resolve(__dirname, '../data/test_prefix.db');

describe('Dynamic Prefix Integration & Display Tests', () => {
  let db;
  const guildId = 'test_guild_prefix_123';
  const mockClient = {
    user: { username: 'Pixel-Assistor', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png' },
    commands: new Map(),
  };

  before(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    await init();
    db = getDb();
    commandHandler.load(mockClient);
  });

  after(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('1. Returns default prefix when no custom prefix is set in guild', async () => {
    clearPrefix(guildId);
    const p = await getPrefix(guildId);
    assert.equal(p, '?');
  });

  it('2. setprefix updates database and prefix cache', async () => {
    let replyPayload = null;
    const mockMessage = {
      guild: { id: guildId, ownerId: 'owner_123' },
      author: { id: 'owner_123' },
      member: { permissions: { has: () => true } },
      reply: (payload) => { replyPayload = payload; return Promise.resolve(); },
    };

    await setprefixCmd.execute(mockMessage, ['!'], mockClient);
    assert.ok(replyPayload);

    const updatedPrefix = await getPrefix(guildId);
    assert.equal(updatedPrefix, '!');
  });

  it('3. .info command dynamically displays current guild prefix', async () => {
    let replyPayload = null;
    const mockMessage = {
      guild: { id: guildId },
      reply: (payload) => { replyPayload = payload; return Promise.resolve(); },
    };

    // Current prefix is '!'
    await infoCmd.execute(mockMessage);
    assert.ok(replyPayload);
    const raw = replyPayload.components ? JSON.stringify(replyPayload.components) : JSON.stringify(replyPayload);
    assert.ok(raw.includes('`!`'), 'Info embed should display the dynamic guild prefix `!`');
    assert.ok(!raw.includes('`?`'), 'Info embed should not display old hardcoded `?`');

    // Change prefix to 'px.'
    await setPrefix(guildId, 'px.');
    await db.guildConfig.set(guildId, { prefix: 'px.' });

    await infoCmd.execute(mockMessage);
    const raw2 = replyPayload.components ? JSON.stringify(replyPayload.components) : JSON.stringify(replyPayload);
    assert.ok(raw2.includes('`px.`'), 'Info embed should display the updated prefix `px.`');
  });

  it('4. .help command dynamically displays current guild prefix on home & detail', async () => {
    await setPrefix(guildId, '>>');
    await db.guildConfig.set(guildId, { prefix: '>>' });

    let replyPayload = null;
    const mockMessage = {
      guild: { id: guildId },
      author: { id: 'user_123', username: 'TestUser' },
      reply: (payload) => { replyPayload = payload; return Promise.resolve({ id: 'msg_1' }); },
    };

    await helpCmd.execute(mockMessage, [], mockClient);
    const homeContent = v2(replyPayload);
    assert.ok(homeContent.includes('Prefix for this server: **>>**'));
    assert.ok(homeContent.includes('Type **>>help** for more Info'));

    // Command detail lookup
    await helpCmd.execute(mockMessage, ['ping'], mockClient);
    const detailContent = v2(replyPayload);
    assert.ok(detailContent.includes('>>ping'));
  });

  it('5. Resetting prefix back to default restores default prefix everywhere', async () => {
    let replyPayload = null;
    const mockMessage = {
      guild: { id: guildId, ownerId: 'owner_123' },
      author: { id: 'owner_123' },
      member: { permissions: { has: () => true } },
      reply: (payload) => { replyPayload = payload; return Promise.resolve(); },
    };

    await setprefixCmd.execute(mockMessage, ['reset'], mockClient);
    const p = await getPrefix(guildId);
    assert.equal(p, '?');

    const mockInfoMsg = {
      guild: { id: guildId },
      reply: (payload) => { replyPayload = payload; return Promise.resolve(); },
    };
    await infoCmd.execute(mockInfoMsg);
    const raw = replyPayload.components ? JSON.stringify(replyPayload.components) : JSON.stringify(replyPayload);
    assert.ok(raw.includes('`?`'));
  });
});
