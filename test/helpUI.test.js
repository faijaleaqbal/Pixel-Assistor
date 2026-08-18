// test/helpUI.test.js
// Unit tests for the redesigned Rainy Assistant style Help Menu UI.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const helpCmd = require('../commands/utility/help');
const meta = require('../utils/commandMeta');
const commandHandler = require('../handlers/commandHandler');
const { DISPLAY, EMOJI } = require('../utils/categories');

describe('Help UI Redesign (Rainy Assistant Style)', () => {
  before(() => {
    // Load all bot commands into metadata registry
    commandHandler.load({ commands: new Map() });
  });

  it('Exports valid Discord command metadata and execute functions', () => {
    assert.equal(helpCmd.name, 'help');
    assert.equal(helpCmd.category, 'utility');
    assert.ok(Array.isArray(helpCmd.aliases));
    assert.equal(typeof helpCmd.execute, 'function');
    assert.equal(typeof helpCmd.slashExecute, 'function');
    assert.equal(typeof helpCmd.handleInteraction, 'function');
  });

  it('Calculates total commands and categories dynamically', () => {
    const totalCmds = meta.total();
    const availableCats = meta.CATEGORIES.filter((c) => meta.byCategory(c).length > 0);
    assert.ok(totalCmds > 50, `Total commands (${totalCmds}) should be > 50`);
    assert.ok(availableCats.length >= 7, `Categories (${availableCats.length}) should be >= 7`);
  });

  it('Interactive interaction security: rejects interactions from other users', async () => {
    let repliedContent = null;
    let ephemeralFlag = false;

    const mockInteraction = {
      message: { id: 'msg_12345' },
      user: { id: 'intruder_999', username: 'Intruder' },
      guildId: 'guild_1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['crypto'],
      reply: async (payload) => {
        repliedContent = payload.content;
        ephemeralFlag = payload.ephemeral;
      },
    };

    // Simulate another user clicking menu
    // First trigger help as OwnerUser
    const mockMsg = {
      author: { id: 'owner_111', username: 'OwnerUser' },
      guild: { id: 'guild_1' },
      reply: async () => ({ id: 'msg_12345' }),
    };

    await helpCmd.execute(mockMsg, [], {});
    await helpCmd.handleInteraction(mockInteraction, {});

    assert.ok(ephemeralFlag, 'Should be ephemeral');
    assert.match(repliedContent, /This help menu belongs to \*\*OwnerUser\*\*/);
  });

  it('Interactive category selection updates embed to selected category', async () => {
    let updatedPayload = null;

    const mockMsg = {
      author: { id: 'user_456', username: 'TestUser' },
      guild: { id: 'guild_1' },
      reply: async () => ({ id: 'msg_98765' }),
    };

    await helpCmd.execute(mockMsg, [], {});

    const mockInteraction = {
      message: { id: 'msg_98765' },
      user: { id: 'user_456', username: 'TestUser' },
      guildId: 'guild_1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['crypto'],
      update: async (payload) => {
        updatedPayload = payload;
      },
    };

    await helpCmd.handleInteraction(mockInteraction, {});

    assert.ok(updatedPayload, 'update payload should be returned');
    assert.ok(updatedPayload.embeds.length > 0);
    const title = updatedPayload.embeds[0].data.title;
    assert.match(title, /Crypto Commands • Page 1/);

    const desc = updatedPayload.embeds[0].data.description;
    assert.match(desc, /«"\?bal"/);
    assert.match(desc, /«"\?txid"/);
    assert.match(desc, /━━━━━━━━━━━━━━━━━━━━/);
  });

  it('Interactive button navigation advances and retreats pages', async () => {
    let updatedPayload = null;

    const mockMsg = {
      author: { id: 'user_789', username: 'NavUser' },
      guild: { id: 'guild_1' },
      reply: async () => ({ id: 'msg_nav_1' }),
    };

    await helpCmd.execute(mockMsg, [], {});

    // Select admin category (multiple pages)
    const selectAdmin = {
      message: { id: 'msg_nav_1' },
      user: { id: 'user_789', username: 'NavUser' },
      guildId: 'guild_1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['admin'],
      update: async (payload) => {
        updatedPayload = payload;
      },
    };
    await helpCmd.handleInteraction(selectAdmin, {});

    // Click Next button
    const clickNext = {
      message: { id: 'msg_nav_1' },
      user: { id: 'user_789', username: 'NavUser' },
      guildId: 'guild_1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_next',
      update: async (payload) => {
        updatedPayload = payload;
      },
    };
    await helpCmd.handleInteraction(clickNext, {});

    assert.ok(updatedPayload);
    assert.match(updatedPayload.embeds[0].data.title, /Admin Commands • Page 2/);

    // Click Prev button
    const clickPrev = {
      message: { id: 'msg_nav_1' },
      user: { id: 'user_789', username: 'NavUser' },
      guildId: 'guild_1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_prev',
      update: async (payload) => {
        updatedPayload = payload;
      },
    };
    await helpCmd.handleInteraction(clickPrev, {});

    assert.ok(updatedPayload);
    assert.match(updatedPayload.embeds[0].data.title, /Admin Commands • Page 1/);
  });

  it('Home button returns to Help Menu overview', async () => {
    let updatedPayload = null;

    const mockMsg = {
      author: { id: 'user_home', username: 'HomeUser' },
      guild: { id: 'guild_1' },
      reply: async () => ({ id: 'msg_home_1' }),
    };

    await helpCmd.execute(mockMsg, [], {});

    const clickHome = {
      message: { id: 'msg_home_1' },
      user: { id: 'user_home', username: 'HomeUser' },
      guildId: 'guild_1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_home',
      update: async (payload) => {
        updatedPayload = payload;
      },
    };
    await helpCmd.handleInteraction(clickHome, {});

    assert.ok(updatedPayload);
    assert.equal(updatedPayload.embeds[0].data.title, 'Help Menu');
    assert.match(updatedPayload.embeds[0].data.description, /Hey HomeUser!/);
  });
});
