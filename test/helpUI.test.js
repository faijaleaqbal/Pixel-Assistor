// test/helpUI.test.js
// Unit & Integration tests for Pixel-Assistor's redesigned Help Menu UI.
// Covers all 23 design, dynamic calculation, UX, and security test cases.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');

const helpCmd = require('../commands/utility/help');
const meta = require('../utils/commandMeta');
const commandHandler = require('../handlers/commandHandler');
const subs = require('../utils/subcommands');
const v2 = require('./helpers/v2');

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
  it('1. Home page renders H3 title, emojis, companion text, and structure', () => {
    const user = { id: '111222333', username: 'TestUser' };
    const content = v2(helpCmd.buildHomeContent(mockClient, '.', user));
    assert.ok(content.startsWith('### Help Menu'));
    assert.ok(content.includes('Type **.help** for more Info'));
    assert.ok(content.includes("I'm *Pixel-Assistor*, your friendly companion."));
    assert.ok(content.includes('Pick from the menu below to continue!'));
  });

  // 2. Dynamic command count
  it('2. Dynamic command count matches total registered commands', () => {
    const totalCmds = meta.total();
    assert.equal(totalCmds, 123);
    const content = v2(helpCmd.buildHomeContent(mockClient, '!', { id: '1', username: 'User' }));
    assert.ok(content.includes(`Total Commands: **${totalCmds}**`));
  });

  // 3. Dynamic category count
  it('3. Dynamic category count matches available categories', () => {
    const cats = helpCmd.getAvailableCategories();
    assert.equal(cats.length, 8);
    const content = v2(helpCmd.buildHomeContent(mockClient, '.', { id: '1', username: 'User' }));
    assert.ok(content.includes(`Categories: **${cats.length}**`));
  });

  // 4. Dynamic prefix
  it('4. Dynamic prefix is properly formatted across all help elements', () => {
    const customPrefix = 'px!';
    const content = v2(helpCmd.buildHomeContent(mockClient, customPrefix, { id: '1', username: 'User' }));
    assert.ok(content.includes(`Type **${customPrefix}help** for more Info`));
    assert.ok(content.includes(`Prefix for this server: **${customPrefix}**`));
  });

  // 5. User mention as markdown profile link
  it('5. User mention renders as linked bold username with id fallback', () => {
    const userWithId = { id: '9988776655', username: 'MentionMe' };
    const content1 = v2(helpCmd.buildHomeContent(mockClient, '.', userWithId));
    assert.ok(content1.includes('Hey **[MentionMe](https://discord.com/users/9988776655)**!'));

    const userWithoutId = { username: 'PlainUser' };
    const content2 = v2(helpCmd.buildHomeContent(mockClient, '.', userWithoutId));
    assert.ok(content2.includes('Hey **PlainUser**!'));
  });

  // 6. Developer subtext footer + dynamic Discord timestamp
  it('6. Footer uses -# subtext with developer name and <t:unix:f> timestamp', () => {
    const content = v2(helpCmd.buildHomeContent(mockClient, '.', { id: '1', username: 'User' }));
    assert.match(content, /-# Developed by .* • <t:\d+:f>/);

    const catContent = v2(helpCmd.buildCategoryContent(mockClient, 'crypto', 0, 1, '.'));
    assert.match(catContent, /-# Developed by .* • <t:\d+:f>/);
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
  it('8. Category page renders H1 header, emoji bullets, and backticked commands', () => {
    const content = v2(helpCmd.buildCategoryContent(mockClient, 'crypto', 0, 1, '.'));
    assert.ok(content.startsWith('# Crypto Commands  •  Page 1/1'));
    const desc = content;
    assert.match(desc, /`\.bal`/);
    assert.match(desc, /`\.convert`/);
    assert.match(desc, /`\.price`/);
    assert.match(desc, /`\.txid`/);
  });

  // 9. Missing descriptions & Description compaction
  it('9. Missing descriptions fallback to "No description provided." and long descriptions are compacted', () => {
    meta.register('testnodesccmd', { category: 'nodesccat', description: '' });
    const content = v2(helpCmd.buildCategoryContent(mockClient, 'nodesccat', 0, 1, '.'));
    assert.ok(content.includes('`.testnodesccmd` — No description provided.'));

    const longDesc = 'This is an extremely long command description that explains every single nuance of server administration and security moderation in excessive detail';
    const compacted = helpCmd.compactDescription(longDesc, 80);
    assert.ok(compacted.length <= 83);
    assert.ok(compacted.endsWith('...'));
  });

  // 10. Group markers
  it('10. Group markers show **[Group]** for commands with subcommands', () => {
    assert.ok(subs.has('autopurge'));
    const content = v2(helpCmd.buildCategoryContent(mockClient, 'moderation', 0, 8, '.'));
    assert.ok(content.includes('`.autopurge` **[Group]**'));
  });

  // 11. Aliases
  it('11. Aliases are displayed in single command detail lookup', () => {
    const convertMeta = meta.get('convert');
    assert.ok(convertMeta);
    const detailEmbed = v2(helpCmd.buildCommandDetailEmbed(convertMeta, '.', mockClient));
    assert.match(v2(detailEmbed), /Aliases[\s\S]*cv/);
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

    const rows13 = v2.v2Rows(sentComponents);
    const prevBtn = rows13.flatMap((r) => r.components).find((c) => c.custom_id === 'help_prev');
    const nextBtn = rows13.flatMap((r) => r.components).find((c) => c.custom_id === 'help_next');

    assert.equal(prevBtn.disabled, true, 'Previous should be disabled on first page');
    assert.equal(nextBtn.disabled, false, 'Next should be enabled on first page');
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

    assert.match(v2(sentPayload), /# Admin Commands.*Page 2\/2/);
    const rows = v2.v2Rows(sentPayload);
    const prevBtn = rows.flatMap((r) => r.components).find((c) => c.custom_id === 'help_prev');
    const nextBtn = rows.flatMap((r) => r.components).find((c) => c.custom_id === 'help_next');

    assert.equal(prevBtn.disabled, false, 'Previous should be enabled on last page');
    assert.equal(nextBtn.disabled, true, 'Next should be disabled on last page');
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
    assert.match(v2(sentPayload), /# Admin Commands.*Page 2\/2/);

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
    assert.match(v2(sentPayload), /# Admin Commands.*Page 1\/2/);
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

    assert.match(v2(sentPayload), /# Admin Commands.*Page 2\/2/);
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

    assert.ok(v2(sentPayload).startsWith('### Help Menu'));
    assert.match(v2(sentPayload), /Type \*\*.*help\*\* for more Info/);
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
    assert.match(v2(sentPayload), /# Fun Commands.*Page 1\/1/);

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
    assert.ok(v2(sentPayload).startsWith('### Help Menu'));
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
    assert.equal(Boolean(Number(replyPayload.flags) & MessageFlags.Ephemeral), true);
    assert.equal(v2(replyPayload), "This Help Menu isn't yours.");
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
    assert.match(v2(sentPayload), /# Games Commands.*Page 1\/1/);
  });

  // 21. Empty category
  it('21. Empty category renders placeholder message and handles 1/1 pages', () => {
    const content = v2(helpCmd.buildCategoryContent(mockClient, 'emptycat', 0, 1, '.'));
    assert.ok(content.includes('No commands available in this category.'));
  });

  // 22. Large category
  it('22. Large category paginates and chunks across multiple pages correctly', () => {
    const modTotal = meta.byCategory('moderation').length;
    assert.ok(modTotal >= 50, 'Moderation category has large command count');
    const totalPages = helpCmd.calcTotalPages('moderation');
    assert.equal(totalPages, 8);

    for (let p = 0; p < totalPages; p++) {
      const content = v2(helpCmd.buildCategoryContent(mockClient, 'moderation', p, totalPages, '.'));
      assert.ok(content.length > 30);
      assert.match(content, new RegExp(`^# Moderation Commands\\s+•\\s+Page ${p + 1}/${totalPages}`));
    }
  });

  // 23. Discord message limits
  it('23. Discord limits: plain message content stays safely under 2000 chars', () => {
    const homeContent = v2(helpCmd.buildHomeContent(mockClient, '.', { id: '1', username: 'Test' }));
    assert.ok(homeContent.length < 2000);

    for (const cat of helpCmd.getAvailableCategories()) {
      const totalPages = helpCmd.calcTotalPages(cat);
      for (let p = 0; p < totalPages; p++) {
        const catContent = v2(helpCmd.buildCategoryContent(mockClient, cat, p, totalPages, '.'));
        assert.ok(catContent.length < 2000, `${cat} page ${p} exceeded 2000 chars`);
      }
    }
  });
});
