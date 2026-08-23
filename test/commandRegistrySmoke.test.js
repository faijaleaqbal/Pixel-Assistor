// test/commandRegistrySmoke.test.js
// Comprehensive command registry smoke-test and high-risk moderation test suite.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const commandHandler = require('../handlers/commandHandler');
const meta = require('../utils/commandMeta');
const banCmd = require('../commands/moderation/ban');
const kickCmd = require('../commands/moderation/kick');
const muteCmd = require('../commands/moderation/mute');
const timeoutCmd = require('../commands/moderation/timeout');
const { isExempt, punish } = require('../events/antinukeHelpers');
const v2 = require('./helpers/v2');

describe('Command Registry & Smoke Tests', () => {
  const mockClient = { commands: new Map() };
  let loadedCommands = null;

  before(() => {
    loadedCommands = commandHandler.load(mockClient);
  });

  it('Loads all command files without errors', () => {
    assert.ok(loadedCommands.size >= 120, `Loaded commands (${loadedCommands.size}) should be >= 120`);
  });

  it('Verifies every command exports required properties (name, execute, category)', () => {
    const root = path.join(__dirname, '..', 'commands');
    const categories = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

    for (const cat of categories) {
      const dir = path.join(root, cat);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

      for (const file of files) {
        const fp = path.join(dir, file);
        const cmd = require(fp);

        assert.ok(typeof cmd.name === 'string' && cmd.name.length > 0, `${fp} missing valid 'name'`);
        assert.ok(typeof cmd.execute === 'function', `${fp} missing valid 'execute' function`);
        assert.ok(typeof cmd.category === 'string' && cmd.category.length > 0, `${fp} missing valid 'category'`);
        assert.ok(typeof cmd.cooldown === 'number', `${fp} missing valid numeric 'cooldown'`);

        if (cmd.aliases) {
          assert.ok(Array.isArray(cmd.aliases), `${fp} 'aliases' must be an array`);
        }
        if (cmd.permissions) {
          assert.ok(Array.isArray(cmd.permissions), `${fp} 'permissions' must be an array`);
        }
      }
    }
  });

  it('Ensures zero duplicate command names across the entire registry', () => {
    const names = new Set();
    for (const [name] of loadedCommands.entries()) {
      assert.equal(names.has(name), false, `Duplicate command name detected: ${name}`);
      names.add(name);
    }
  });

  it('Ensures zero duplicate aliases across all commands', () => {
    const registeredAliases = new Map();
    for (const [cmdName, cmd] of loadedCommands.entries()) {
      if (!cmd.aliases || !Array.isArray(cmd.aliases)) continue;
      for (const a of cmd.aliases) {
        const alias = a.toLowerCase();
        assert.equal(
          loadedCommands.has(alias),
          false,
          `Alias "${alias}" in command "${cmdName}" conflicts with an existing command name!`
        );
        if (registeredAliases.has(alias)) {
          assert.equal(
            registeredAliases.get(alias),
            cmdName,
            `Alias "${alias}" in command "${cmdName}" is already registered to "${registeredAliases.get(alias)}"!`
          );
        }
        registeredAliases.set(alias, cmdName);
      }
    }
  });

  it('Dynamic categories: metadata registry dynamically reflects loaded categories', () => {
    const cats = meta.getCategories();
    assert.ok(cats.length >= 7, `Expected at least 7 dynamic categories, got ${cats.length}`);
    assert.ok(cats.includes('moderation'));
    assert.ok(cats.includes('crypto'));
    assert.ok(cats.includes('utility'));
    assert.ok(cats.includes('admin'));
  });
});

describe('High-Risk Moderation Commands Security & Hierarchy', () => {
  const OWNER_ID = '999999999999999999';
  const MOD_ID = '111111111111111111';
  const BOT_ID = '222222222222222222';
  const HIGHER_ID = '333333333333333333';
  const LOWER_ID = '444444444444444444';

  function makeMockGuild() {
    const membersMap = new Map();
    membersMap.set(HIGHER_ID, {
      id: HIGHER_ID,
      bannable: false,
      kickable: false,
      moderatable: false,
      roles: { highest: { position: 100 } },
      user: { id: HIGHER_ID, tag: 'Higher#0001' },
    });
    membersMap.set(LOWER_ID, {
      id: LOWER_ID,
      bannable: true,
      kickable: true,
      moderatable: true,
      roles: { highest: { position: 10 } },
      user: { id: LOWER_ID, tag: 'Lower#0001' },
      timeout: async () => {},
      kick: async () => {},
    });
    membersMap.set(OWNER_ID, {
      id: OWNER_ID,
      roles: { highest: { position: 999 } },
      user: { id: OWNER_ID, tag: 'Owner#0001' },
    });
    membersMap.set(MOD_ID, {
      id: MOD_ID,
      roles: { highest: { position: 50 } },
      user: { id: MOD_ID, tag: 'Mod#0001' },
    });
    membersMap.set(BOT_ID, {
      id: BOT_ID,
      roles: { highest: { position: 80 } },
      permissions: { has: () => true },
      user: { id: BOT_ID, tag: 'Bot#0001' },
    });

    return {
      id: 'guild_test_1',
      ownerId: OWNER_ID,
      members: {
        me: membersMap.get(BOT_ID),
        fetch: async (id) => membersMap.get(id) || null,
        cache: membersMap,
      },
      bans: {
        create: async () => {},
      },
    };
  }

  function makeMockMessage(guild) {
    const mentionsMap = new Map();
    for (const [id, m] of guild.members.cache.entries()) {
      mentionsMap.set(id, m.user);
    }

    return {
      guild,
      author: { id: MOD_ID, tag: 'Mod#0001' },
      client: {
        user: { id: BOT_ID, tag: 'Bot#0001' },
        users: {
          fetch: async (id) => guild.members.cache.get(id)?.user || null,
        },
      },
      member: guild.members.cache.get(MOD_ID),
      mentions: {
        users: mentionsMap,
      },
    };
  }

  it('Ban: blocks banning server owner, self, bot, and higher-ranked members', async () => {
    const guild = makeMockGuild();
    let replied = null;
    const mockMsg = {
      ...makeMockMessage(guild),
      reply: async (p) => {
        replied = p;
      },
    };

    // 1. Try to ban server owner
    await banCmd.execute(mockMsg, [OWNER_ID]);
    assert.match(v2(replied), /cannot ban the server owner/);

    // 2. Try to ban self
    await banCmd.execute(mockMsg, [MOD_ID]);
    assert.match(v2(replied), /cannot ban yourself/);

    // 3. Try to ban bot
    await banCmd.execute(mockMsg, [BOT_ID]);
    assert.match(v2(replied), /cannot ban myself/);

    // 4. Try to ban higher member
    await banCmd.execute(mockMsg, [HIGHER_ID]);
    assert.match(v2(replied), /equal to or higher/);
  });

  it('Kick: blocks kicking server owner, self, bot, and higher-ranked members', async () => {
    const guild = makeMockGuild();
    let replied = null;
    const mockMsg = {
      ...makeMockMessage(guild),
      reply: async (p) => {
        replied = p;
      },
    };

    // 1. Try to kick server owner
    await kickCmd.execute(mockMsg, [OWNER_ID]);
    assert.match(v2(replied), /cannot kick the server owner/);

    // 2. Try to kick self
    await kickCmd.execute(mockMsg, [MOD_ID]);
    assert.match(v2(replied), /cannot kick yourself/);

    // 3. Try to kick bot
    await kickCmd.execute(mockMsg, [BOT_ID]);
    assert.match(v2(replied), /cannot kick myself/);

    // 4. Try to kick higher member
    await kickCmd.execute(mockMsg, [HIGHER_ID]);
    assert.match(v2(replied), /equal or higher role/);
  });

  it('Mute/Timeout: validates duration limits (1s to 28d) and rejects invalid durations', async () => {
    const guild = makeMockGuild();
    let replied = null;
    const mockMsg = {
      ...makeMockMessage(guild),
      reply: async (p) => {
        replied = p;
      },
    };

    // Invalid duration
    await muteCmd.execute(mockMsg, [LOWER_ID, '50d']);
    assert.match(v2(replied), /Duration must be between 1s and 28d/);

    await timeoutCmd.execute(mockMsg, [LOWER_ID, 'invalid_time']);
    assert.match(v2(replied), /Invalid duration/);
  });

  it('Anti-Nuke: protects server owner, bot, and configured owners from punishment', async () => {
    const guild = makeMockGuild();
    const cfg = {
      enabled: true,
      punishment: 'ban',
      owners: ['555555555555555555'],
      whitelist: ['666666666666666666'],
      wlRoles: [],
    };
    const client = { user: { id: BOT_ID } };

    // 1. Check exemptions
    assert.equal(await isExempt({ id: OWNER_ID }, guild, cfg, client), true);
    assert.equal(await isExempt({ id: BOT_ID }, guild, cfg, client), true);
    assert.equal(await isExempt({ id: '555555555555555555' }, guild, cfg, client), true);
    assert.equal(await isExempt({ id: '666666666666666666' }, guild, cfg, client), true);
    assert.equal(await isExempt({ id: '777777777777777777' }, guild, cfg, client), false);

    // 2. Punish safety guards
    let banCalled = false;
    const dangerousMember = {
      id: OWNER_ID,
      ban: async () => {
        banCalled = true;
      },
    };
    guild.members.fetch = async () => dangerousMember;

    await punish(guild, cfg, { id: OWNER_ID });
    assert.equal(banCalled, false, 'Should NEVER ban guild owner');

    await punish(guild, cfg, { id: BOT_ID });
    assert.equal(banCalled, false, 'Should NEVER ban bot itself');
  });
});
