// test/helpUI.test.js
// Unit & Integration tests for Pixel-Assistor's redesigned Help Menu UI.
// Covers all 23 design, dynamic calculation, UX, and security test cases.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const helpCmd = require('../commands/utility/help');
const meta = require('../utils/commandMeta');
const commandHandler = require('../handlers/commandHandler');
const subs = require('../utils/subcommands');

describe('Help UI Presentation & Logic (Rainy Reference Style)', () => {
  const mockClient = {
    user: {
      username: 'Pixel-Assistor',
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
    },
    users: {
      cache: new Map(),
    },
  };

  before(() => {
    // Load all bot commands into metadata registry
    commandHandler.load({ commands: new Map() });
  });

  // 1. Home page
  it('1. Home page renders proper title, emojis, companion text, and structure', () => {
    const user = { id: '111222333', username: 'TestUser' };
    const embed = helpCmd.buildHomeEmbed(mockClient, '.', user);
    assert.equal(embed.data.title, 'Help Menu');
    assert.ok(embed.data.description.includes('Type **.help** for more Info'));
    assert.ok(embed.data.description.includes("I'm *Pixel-Assistor*, your friendly companion."));
    assert.ok(embed.data.description.includes('Pick from the menu below to continue!'));
    assert.equal(embed.data.thumbnail, undefined, 'Home page should not contain thumbnail');
  });

  // 2. Dynamic command count
  it('2. Dynamic command count matches total registered commands', () => {
    const totalCmds = meta.total();
    assert.equal(totalCmds, 124);
    const embed = helpCmd.buildHomeEmbed(mockClient, '!', { id: '1', username: 'User' });
    assert.ok(embed.data.description.includes(`Total Commands: **${totalCmds}**`));
  });

  // 3. Dynamic category count
  it('3. Dynamic category count matches available categories', () => {
    const cats = helpCmd.getAvailableCategories();
    assert.equal(cats.length, 8);
    const embed = helpCmd.buildHomeEmbed(mockClient, '.', { id: '1', username: 'User' });
    assert.ok(embed.data.description.includes(`Categories: **${cats.length}**`));
  });

  // 4. Dynamic prefix
  it('4. Dynamic prefix is properly formatted across all embed elements', () => {
    const customPrefix = 'px!';
    const embed = helpCmd.buildHomeEmbed(mockClient, customPrefix, { id: '1', username: 'User' });
    assert.ok(embed.data.description.includes(`Type **${customPrefix}help** for more Info`));
    assert.ok(embed.data.description.includes(`Prefix for this server: **${customPrefix}**`));
  });

  // 5. User mention
  it('5. User mention displays properly with <@id> or bold username', () => {
    const userWithId = { id: '9988776655', username: 'MentionMe' };
    const embed1 = helpCmd.buildHomeEmbed(mockClient, '.', userWithId);
    assert.ok(embed1.data.description.includes('Hey <@9988776655>!'));

    const userWithoutId = { username: 'PlainUser' };
    const embed2 = helpCmd.buildHomeEmbed(mockClient, '.', userWithoutId);
    assert.ok(embed2.data.description.includes('Hey **PlainUser**!'));
  });

  // 6. Developer footer
  it('6. Developer footer includes developer name and dynamic Discord timestamp in <t:TIMESTAMP:f> format', () => {
    const embed = helpCmd.buildHomeEmbed(mockClient, '.', { id: '1', username: 'User' });
    assert.match(embed.data.description, /-# Developed by \*\*.*\*\* • <t:\d+:f>/);

    const catEmbed = helpCmd.buildCategoryEmbed(mockClient, 'crypto', 0, 1, '.');
    assert.match(catEmbed.data.description, /-# Developed by \*\*.*\*\* • <t:\d+:f>/);
  });

  // 7. Category generation
  it('7. Category generation extracts all categories dynamically from commandMeta', () => {
    const categories = helpCmd.getAvailableCategories();
    assert.deepEqual(categories.sort(), [
      'admin',
      'crypto',
      'extra',
      'fun',
      'games',
      'moderation',
      'upi',
      'utility',
    ]);
  });

  // 8. Category command rendering
  it('8. Category command rendering displays commands in reference format without thumbnail', () => {
    const embed = helpCmd.buildCategoryEmbed(mockClient, 'crypto', 0, 1, '.');
    assert.equal(embed.data.title, 'Crypto Commands • Page 1/1');
    assert.equal(embed.data.thumbnail, undefined, 'Category embed should have no thumbnail');
    const desc = embed.data.description;
    assert.match(desc, /`\.bal`/);
    assert.match(desc, /`\.convert`/);
    assert.match(desc, /`\.price`/);
    assert.match(desc, /`\.txid`/);
  });

  // 9. Missing descriptions & Description compaction
  it('9. Missing descriptions fallback to "No description provided." and long descriptions are compacted', () => {
    meta.register('testnodesccmd', { category: 'nodesccat', description: '' });
    const embed = helpCmd.buildCategoryEmbed(mockClient, 'nodesccat', 0, 1, '.');
    assert.ok(embed.data.description.includes('`.testnodesccmd` — No description provided.'));

    const longDesc = 'This is an extremely long command description that explains every single nuance of server administration and security moderation in excessive detail';
    const compacted = helpCmd.compactDescription(longDesc, 80);
    assert.ok(compacted.length <= 83);
    assert.ok(compacted.endsWith('...'));
  });

  // 10. Group markers
  it('10. Group markers show **[Group]** for commands with subcommands', () => {
    assert.ok(subs.has('autopurge'));
    const embed = helpCmd.buildCategoryEmbed(mockClient, 'moderation', 0, 8, '.');
    assert.ok(embed.data.description.includes('`.autopurge` **[Group]**'));
  });

  // 11. Aliases
  it('11. Aliases are displayed in single command detail lookup', () => {
    const convertMeta = meta.get('convert');
    assert.ok(convertMeta);
    const detailEmbed = helpCmd.buildCommandDetailEmbed(convertMeta, '.', mockClient);
    assert.ok(detailEmbed.data.fields.some((f) => f.name === '🏷 Aliases' && f.value.includes('cv')));
  });

  // 12. Pagination
  it('12. Pagination calculates total pages correctly with 7 commands per page', () => {
    const modPages = helpCmd.calcTotalPages('moderation');
    assert.equal(modPages, 8); // 52 commands / 7 = 8 pages
    const adminPages = helpCmd.calcTotalPages('admin');
    assert.equal(adminPages, 2); // 13 commands / 7 = 2 pages
    const cryptoPages = helpCmd.calcTotalPages('crypto');
    assert.equal(cryptoPages, 1); // 4 commands / 7 = 1 page
  });

  // 13. First page
  it('13. First page disables Previous button and renders Page 1', async () => {
    let sentComponents = null;
    const mockMsg = {
      author: { id: 'p1_user', username: 'P1User' },
      guild: { id: 'g1' },
      reply: async (payload) => {
        sentComponents = payload.components;
        return { id: 'msg_p1' };
      },
    };

    await helpCmd.execute(mockMsg, [], mockClient);

    const selectMod = {
      message: { id: 'msg_p1' },
      user: { id: 'p1_user', username: 'P1User' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['moderation'],
      update: async (payload) => {
        sentComponents = payload.components;
      },
    };
    await helpCmd.handleInteraction(selectMod, mockClient);

    const buttonRow = sentComponents.find((row) => row.components.some((c) => c.data.custom_id === 'help_prev'));
    const prevBtn = buttonRow.components.find((c) => c.data.custom_id === 'help_prev');
    const nextBtn = buttonRow.components.find((c) => c.data.custom_id === 'help_next');

    assert.equal(prevBtn.data.disabled, true, 'Previous should be disabled on first page');
    assert.equal(nextBtn.data.disabled, false, 'Next should be enabled on first page');
  });

  // 14. Last page
  it('14. Last page disables Next button and enables Previous button', async () => {
    let sentPayload = null;
    const mockMsg = {
      author: { id: 'plast_user', username: 'PLastUser' },
      guild: { id: 'g1' },
      reply: async () => ({ id: 'msg_plast' }),
    };

    await helpCmd.execute(mockMsg, [], mockClient);

    // Select admin (2 pages)
    await helpCmd.handleInteraction({
      message: { id: 'msg_plast' },
      user: { id: 'plast_user', username: 'PLastUser' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['admin'],
      update: async (p) => { sentPayload = p; },
    }, mockClient);

    // Advance to page 2 (last page)
    await helpCmd.handleInteraction({
      message: { id: 'msg_plast' },
      user: { id: 'plast_user', username: 'PLastUser' },
      guildId: 'g1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_next',
      update: async (p) => { sentPayload = p; },
    }, mockClient);

    assert.match(sentPayload.embeds[0].data.title, /Admin Commands • Page 2\/2/);
    const buttonRow = sentPayload.components.find((row) => row.components.some((c) => c.data.custom_id === 'help_prev'));
    const prevBtn = buttonRow.components.find((c) => c.data.custom_id === 'help_prev');
    const nextBtn = buttonRow.components.find((c) => c.data.custom_id === 'help_next');

    assert.equal(prevBtn.data.disabled, false, 'Previous should be enabled on last page');
    assert.equal(nextBtn.data.disabled, true, 'Next should be disabled on last page');
  });

  // 15. Previous button
  it('15. Previous button decrements current page', async () => {
    let sentPayload = null;
    const mockMsg = {
      author: { id: 'prev_user', username: 'PrevUser' },
      guild: { id: 'g1' },
      reply: async () => ({ id: 'msg_prev' }),
    };
    await helpCmd.execute(mockMsg, [], mockClient);

    // Select admin
    await helpCmd.handleInteraction({
      message: { id: 'msg_prev' },
      user: { id: 'prev_user', username: 'PrevUser' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['admin'],
      update: async (p) => { sentPayload = p; },
    }, mockClient);

    // Go to next page (Page 2)
    await helpCmd.handleInteraction({
      message: { id: 'msg_prev' },
      user: { id: 'prev_user', username: 'PrevUser' },
      guildId: 'g1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_next',
      update: async (p) => { sentPayload = p; },
    }, mockClient);
    assert.match(sentPayload.embeds[0].data.title, /Admin Commands • Page 2\/2/);

    // Go back with prev (Page 1)
    await helpCmd.handleInteraction({
      message: { id: 'msg_prev' },
      user: { id: 'prev_user', username: 'PrevUser' },
      guildId: 'g1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_prev',
      update: async (p) => { sentPayload = p; },
    }, mockClient);
    assert.match(sentPayload.embeds[0].data.title, /Admin Commands • Page 1\/2/);
  });

  // 16. Next button
  it('16. Next button increments current page', async () => {
    let sentPayload = null;
    const mockMsg = {
      author: { id: 'next_user', username: 'NextUser' },
      guild: { id: 'g1' },
      reply: async () => ({ id: 'msg_next' }),
    };
    await helpCmd.execute(mockMsg, [], mockClient);

    await helpCmd.handleInteraction({
      message: { id: 'msg_next' },
      user: { id: 'next_user', username: 'NextUser' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['admin'],
      update: async (p) => { sentPayload = p; },
    }, mockClient);

    await helpCmd.handleInteraction({
      message: { id: 'msg_next' },
      user: { id: 'next_user', username: 'NextUser' },
      guildId: 'g1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_next',
      update: async (p) => { sentPayload = p; },
    }, mockClient);

    assert.match(sentPayload.embeds[0].data.title, /Admin Commands • Page 2\/2/);
  });

  // 17. Home button
  it('17. Home button returns view to main Home overview', async () => {
    let sentPayload = null;
    const mockMsg = {
      author: { id: 'h_user', username: 'HUser' },
      guild: { id: 'g1' },
      reply: async () => ({ id: 'msg_h' }),
    };
    await helpCmd.execute(mockMsg, [], mockClient);

    // Select crypto
    await helpCmd.handleInteraction({
      message: { id: 'msg_h' },
      user: { id: 'h_user', username: 'HUser' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['crypto'],
      update: async (p) => { sentPayload = p; },
    }, mockClient);

    // Click Home button
    await helpCmd.handleInteraction({
      message: { id: 'msg_h' },
      user: { id: 'h_user', username: 'HUser' },
      guildId: 'g1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_home',
      update: async (p) => { sentPayload = p; },
    }, mockClient);

    assert.equal(sentPayload.embeds[0].data.title, 'Help Menu');
    assert.match(sentPayload.embeds[0].data.description, /Type \*\*.*help\*\* for more Info/);
  });

  // 18. Category selector
  it('18. Category selector dropdown allows jumping between categories and home', async () => {
    let sentPayload = null;
    const mockMsg = {
      author: { id: 'sel_user', username: 'SelUser' },
      guild: { id: 'g1' },
      reply: async () => ({ id: 'msg_sel' }),
    };
    await helpCmd.execute(mockMsg, [], mockClient);

    // Select fun category
    await helpCmd.handleInteraction({
      message: { id: 'msg_sel' },
      user: { id: 'sel_user', username: 'SelUser' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['fun'],
      update: async (p) => { sentPayload = p; },
    }, mockClient);
    assert.match(sentPayload.embeds[0].data.title, /Fun Commands • Page 1\/1/);

    // Select home from dropdown
    await helpCmd.handleInteraction({
      message: { id: 'msg_sel' },
      user: { id: 'sel_user', username: 'SelUser' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['home'],
      update: async (p) => { sentPayload = p; },
    }, mockClient);
    assert.equal(sentPayload.embeds[0].data.title, 'Help Menu');
  });

  // 19. Unauthorized user interaction
  it('19. Unauthorized user interaction rejects with "This Help Menu isn\'t yours."', async () => {
    let replyPayload = null;
    const mockMsg = {
      author: { id: 'legit_user', username: 'LegitUser' },
      guild: { id: 'g1' },
      reply: async () => ({ id: 'msg_sec_1' }),
    };
    await helpCmd.execute(mockMsg, [], mockClient);

    const intruderInteraction = {
      message: { id: 'msg_sec_1' },
      user: { id: 'intruder_123', username: 'Intruder' },
      guildId: 'g1',
      isStringSelectMenu: () => false,
      isButton: () => true,
      customId: 'help_next',
      reply: async (p) => { replyPayload = p; },
    };

    await helpCmd.handleInteraction(intruderInteraction, mockClient);
    assert.equal(replyPayload.ephemeral, true);
    assert.equal(replyPayload.content, "This Help Menu isn't yours.");
  });

  // 20. Expired interaction
  it('20. Expired or un-tracked interaction defaults gracefully without crashing', async () => {
    let sentPayload = null;
    const expiredInteraction = {
      message: { id: 'msg_expired_9999' },
      user: { id: 'recovered_user', username: 'RecoveredUser' },
      guildId: 'g1',
      isStringSelectMenu: () => true,
      isButton: () => false,
      customId: 'help_category_select',
      values: ['games'],
      update: async (p) => { sentPayload = p; },
    };

    await helpCmd.handleInteraction(expiredInteraction, mockClient);
    assert.ok(sentPayload);
    assert.match(sentPayload.embeds[0].data.title, /Games Commands • Page 1\/1/);
  });

  // 21. Empty category
  it('21. Empty category renders placeholder message and handles 1/1 pages', () => {
    const embed = helpCmd.buildCategoryEmbed(mockClient, 'emptycat', 0, 1, '.');
    assert.ok(embed.data.description.includes('No commands available in this category.'));
  });

  // 22. Large category
  it('22. Large category paginates and chunks across multiple pages correctly', () => {
    const modTotal = meta.byCategory('moderation').length;
    assert.ok(modTotal >= 50, 'Moderation category has large command count');
    const totalPages = helpCmd.calcTotalPages('moderation');
    assert.equal(totalPages, 8);

    for (let p = 0; p < totalPages; p++) {
      const embed = helpCmd.buildCategoryEmbed(mockClient, 'moderation', p, totalPages, '.');
      assert.ok(embed.data.description.length > 30);
      assert.equal(embed.data.title, `Moderation Commands • Page ${p + 1}/${totalPages}`);
    }
  });

  // 23. Discord embed limits
  it('23. Discord embed limits: descriptions stay safely under 4096 chars', () => {
    const homeEmbed = helpCmd.buildHomeEmbed(mockClient, '.', { id: '1', username: 'Test' });
    assert.ok(homeEmbed.data.description.length < 4096);

    for (const cat of helpCmd.getAvailableCategories()) {
      const totalPages = helpCmd.calcTotalPages(cat);
      for (let p = 0; p < totalPages; p++) {
        const catEmbed = helpCmd.buildCategoryEmbed(mockClient, cat, p, totalPages, '.');
        assert.ok(catEmbed.data.description.length < 4096, `${cat} page ${p} exceeded 4096 chars`);
      }
    }
  });
});
