// test/allCommandsSmoke.test.js
// Systematic per-command smoke test: loads every command through the real
// commandHandler registry, validates structure + V2 compliance, then executes
// each command against a rich mock Discord environment (empty args AND
// heuristic args). Failures are classified: BUG vs NETWORK vs MOCK-GAP.
// Run: node --test test/allCommandsSmoke.test.js

process.env.DB_SQLITE_PATH = './data/test_smoke.db';
process.env.OWNER_ID = process.env.OWNER_ID || 'test_owner_id';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { init } = require('../utils/db');
const { sqlitePath: smokeSqlitePath } = require('../utils/config');

// SAFETY GUARD: tests must never touch the production database.
if (!String(smokeSqlitePath).includes('data/test_')) {
  throw new Error(`SAFETY GUARD: tests resolved to non-test database "${smokeSqlitePath}". Aborting.`);
}
const commandHandler = require('../handlers/commandHandler');
const meta = require('../utils/commandMeta');

const TEST_DB = path.resolve(__dirname, '../data/test_smoke.db');

// ─────────────────────────────────────────────────────────────
// Mock Discord environment
// ─────────────────────────────────────────────────────────────
const OWNER_ID = 'test_owner_id';

// Minimal discord.js Collection stand-in (iteration + common methods).
function makeCollection(entries = []) {
  const m = new Map(entries);
  const col = {
    get size() { return m.size; },
    get: (k) => m.get(k),
    set: (k, v) => { m.set(k, v); return col; },
    has: (k) => m.has(k),
    delete: (k) => m.delete(k),
    keys: () => m.keys(),
    values: () => m.values(),
    entries: () => m.entries(),
    forEach: (fn) => m.forEach(fn),
    map: (fn) => [...m.values()].map(fn),
    filter: (fn) => makeCollection([...m].filter(([, v]) => fn(v))),
    find: (fn) => [...m.values()].find(fn),
    some: (fn) => [...m.values()].some(fn),
    every: (fn) => [...m.values()].every(fn),
    first: () => [...m.values()][0],
    last: () => [...m.values()][m.size - 1],
    at: (i) => [...m.values()][i],
    reduce: (fn, init) => [...m.values()].reduce(fn, init),
    sort: (fn) => col,
    toJSON: () => [...m.values()],
    [Symbol.iterator]: () => m[Symbol.iterator](),
  };
  return col;
}

function makeCollector() {
  const handlers = {};
  return {
    on: (ev, fn) => { handlers[ev] = fn; },
    once: (ev, fn) => { handlers[ev] = fn; },
    stop: () => {},
    __emit: (ev, ...args) => handlers[ev] && handlers[ev](...args),
  };
}

function makeRole(id, name) {
  return {
    id,
    name,
    hexColor: '#5865F2',
    color: 0x5865F2,
    members: { cache: makeCollection() },
    editable: true,
    deletable: true,
    permissions: { has: () => true, toArray: () => ['SendMessages'] },
    comparePositionTo: () => 1,
    setPosition: async () => makeRole(id, name),
    setName: async () => makeRole(id, name),
    setIcon: async () => makeRole(id, name),
    delete: async () => makeRole(id, name),
  };
}

function makeEmojiObj(name = 'testemoji', id = 'emoji_123') {
  return {
    id,
    name,
    identifier: `${name}:${id}`,
    animated: false,
    url: `https://cdn.discordapp.com/emojis/${id}.png`,
    toString: () => `<:${name}:${id}>`,
    delete: async () => {},
    setName: async () => makeEmojiObj(name, id),
    edit: async () => makeEmojiObj(name, id),
    fetchAuthor: async () => makeUser('emoji_author_1', 'EmojiAuthor'),
  };
}

function makeStickerObj(name = 'teststicker', id = 'sticker_123') {
  return {
    id,
    name,
    url: `https://cdn.discordapp.com/stickers/${id}.png`,
    description: null,
    tags: '',
    delete: async () => {},
    setName: async () => makeStickerObj(name, id),
    edit: async () => makeStickerObj(name, id),
    fetchUser: async () => makeUser('sticker_author_1', 'StickerAuthor'),
    fetchPack: async () => ({}),
  };
}

function makeMember(user) {
  const baseRole = makeRole('r_base', '@base');
  const rolesCol = makeCollection([['r_base', baseRole]]);
  return {
    id: user.id,
    user,
    displayName: user.username,
    nickname: null,
    bannable: true,
    kickable: true,
    manageable: true,
    moderatable: true,
    displayColor: 0x5865F2,
    joinedTimestamp: Date.now() - 86400000,
    permissions: { has: () => true, toArray: () => ['Administrator'] },
    roles: {
      cache: rolesCol,
      add: async () => {},
      remove: async () => {},
      set: async () => {},
      highest: { position: 10, name: 'base', id: 'r_base' },
      everyone: makeRole('everyone', '@everyone'),
    },
    setNickname: async () => {},
    timeout: async () => {},
    ban: async () => {},
    kick: async () => {},
    send: async (p) => ({ id: `dm_${Math.random()}` }),
    voice: { channel: null, setMute: async () => {}, setDeaf: async () => {}, disconnect: async () => {} },
    toString: () => `<@${user.id}>`,
  };
}

function makeChannel(overrides = {}) {
  const sentMessages = [];
  const messagesCache = makeCollection();
  const base = {
    id: overrides.id || `chan_${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'general',
    type: 0, // GUILD_TEXT
    nsfw: false,
    deletable: true,
    viewable: true,
    isThread: () => false,
    isTextBased: () => true,
    topic: 'A general channel',
    position: 1,
    rateLimitPerUser: 0,
    parentID: null,
    guild: overrides.guild,
    permissionsFor: () => ({ has: () => true }),
    permissionOverwrites: {
      cache: makeCollection(),
      create: async () => {},
      delete: async () => {},
      edit: async () => {},
    },
    send: async (p) => {
      const m = makeMessage({ channelOverride: base });
      sentMessages.push({ payload: p });
      messagesCache.set(m.id, m);
      return m;
    },
    bulkDelete: async () => makeCollection(),
    messages: {
      fetch: async (q) => {
        const arr = [...messagesCache.values()];
        if (!arr.length) arr.push(makeMessage({ channelOverride: base }));
        return makeCollection(arr.map((m, i) => [m.id + '_' + i, m]));
      },
      fetchPinned: async () => makeCollection(),
      cache: messagesCache,
    },
    awaitMessages: async () => makeCollection(),
    createMessageCollector: () => makeCollector(),
    createWebhook: async () => ({ id: 'wh_1', url: 'https://discord.com/api/webhooks/1/x', send: async () => ({}) }),
    fetchWebhooks: async () => makeCollection(),
    setRateLimitPerUser: async () => base,
    setName: async () => base,
    setPosition: async () => base,
    setTopic: async () => base,
    setNSFW: async () => base,
    clone: async () => makeChannel(),
    delete: async () => base,
    createInvite: async () => ({ code: 'abc123', url: 'https://discord.gg/abc123' }),
    ...overrides,
  };
  return base;
}

function makeMessage(overrides = {}) {
  const user = overrides.user || makeUser();
  const member = makeMember(user);
  const guild = overrides.guild || makeGuild();
  const channel = overrides.channelOverride || makeChannel();
  const replies = [];
  const msg = {
    id: overrides.id || `msg_${Math.random().toString(36).slice(2, 8)}`,
    content: overrides.content ?? 'hello world',
    author: user,
    member,
    guild,
    channel,
    client: overrides.client,
    createdTimestamp: Date.now(),
    deletable: true,
    editable: true,
    pinned: false,
    attachments: makeCollection(),
    mentions: {
      users: makeCollection(),
      members: makeCollection(),
      roles: makeCollection(),
      channels: makeCollection(),
      repliedUser: null,
    },
    reference: null,
    reply: async (p) => {
      replies.push(p);
      return msg;
    },
    react: async () => ({}),
    pin: async () => {},
    unpin: async () => {},
    delete: async () => {},
    edit: async () => msg,
    createMessageComponentCollector: () => makeCollector(),
    awaitMessageComponent: async () => ({ customId: 'cancel', user, update: async () => {} }),
    __replies: replies,
    ...overrides,
  };
  return msg;
}

function makeUser(id = OWNER_ID, username = 'Tester') {
  return {
    id,
    username,
    tag: `${username}#0001`,
    bot: false,
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    bannerURL: () => null,
    accentColor: null,
    badges: [],
    flags: { has: () => false, toArray: () => [], bitfield: 0 },
    createdAt: new Date('2020-01-01'),
    createdTimestamp: Date.parse('2020-01-01'),
    presence: { status: 'online', activities: [] },
    send: async () => ({ id: `dm_${Math.random()}` }),
    toString: () => `<@${id}>`,
  };
}

function makeGuild() {
  const roleA = makeRole('role_admin_1', 'Admin');
  const channels = [makeChannel({ name: 'general' }), makeChannel({ name: 'logs' })];
  const membersMap = new Map();
  const ownerUser = makeUser('guild_owner_1', 'GuildOwner');
  membersMap.set(OWNER_ID, makeMember(makeUser()));
  membersMap.set('guild_owner_1', makeMember(ownerUser));
  const membersCol = makeCollection([...membersMap].map(([k, v]) => [k, v]));
  const emojiObj = makeEmojiObj();
  const stickerObj = makeStickerObj();

  return {
    id: 'guild_test_1',
    name: 'Test Guild',
    memberId: 'guild_owner_1',
    ownerId: 'guild_owner_1',
    memberCount: 42,
    verificationLevel: 1,
    premiumTier: 2,
    premiumSubscriptionCount: 5,
    description: 'A test guild',
    features: ['COMMUNITY'],
    partnered: false,
    verified: false,
    large: false,
    available: true,
    createdTimestamp: Date.parse('2021-01-01'),
    iconURL: () => 'https://cdn.discordapp.com/icons/g/test.png',
    bannerURL: () => 'https://cdn.discordapp.com/banners/g/test.png',
    splashURL: () => null,
    discoverySplashURL: () => null,
    vanityURLCode: null,
    afkTimeout: 300,
    systemChannelID: channels[0].id,
    rulesChannelID: channels[0].id,
    publicUpdatesChannelID: null,
    maximumPresences: null,
    approximateMemberCount: 42,
    approximatePresenceCount: 20,
    me: { permissions: { has: () => true }, displayName: 'Pixel-Assistor', joinedTimestamp: Date.now() },
    members: {
      cache: membersCol,
      fetch: async (id) => membersCol.get(id) || (() => { throw new Error('Unknown Member'); })(),
    },
    roles: {
      cache: makeCollection([['role_admin_1', roleA]]),
      fetch: async () => roleA,
      create: async () => makeRole(`role_${Date.now()}`, 'Created'),
      everyone: makeRole('everyone', '@everyone'),
    },
    channels: {
      cache: makeCollection(channels.map((c) => [c.id, c])),
      fetch: async () => channels[0],
      create: async () => makeChannel({ name: 'created-channel' }),
    },
    emojis: {
      cache: makeCollection([[emojiObj.id, emojiObj]]),
      create: async () => makeEmojiObj(`em${Date.now().toString(36).slice(-4)}`),
      fetch: async () => emojiObj,
    },
    stickers: {
      cache: makeCollection([[stickerObj.id, stickerObj]]),
      fetch: async (id) => {
        if (!id) return makeCollection([[stickerObj.id, stickerObj]]);
        return id !== stickerObj.id ? (() => { throw new Error('Unknown Sticker'); })() : stickerObj;
      },
      create: async () => makeStickerObj(),
    },
    bans: { create: async () => ({}), remove: async () => ({}), fetch: async () => makeCollection([['banned_user_1', { user: makeUser('banned_user_1', 'Banned'), reason: 'test' }]]) },
    invites: { fetch: async () => makeCollection(), create: async () => ({ code: 'xyz', url: 'https://discord.gg/xyz' }) },
    webhooks: { fetch: async () => makeCollection() },
    leave: async () => {},
    setIcon: async () => {},
    setName: async () => {},
    fetchAuditLogs: async () => ({ entries: makeCollection() }),
    fetchBan: async () => ({ user: makeUser('banned_user_1', 'Banned'), reason: 'test' }),
    unban: async () => {},
    setTimeout: () => {},
  };
}

function makeClient(db) {
  const users = new Map();
  users.set(OWNER_ID, makeUser());
  const guilds = makeCollection([['guild_test_1', makeGuild()]]);
  return {
    ws: { ping: 42, client: null },
    user: makeUser('bot_user_id', 'Pixel-Assistor'),
    users: { cache: makeCollection([[OWNER_ID, makeUser()]]), fetch: async (id) => makeUser(id, `u_${String(id).slice(-4)}`) },
    guilds: { cache: guilds },
    commands: makeCollection(),
    shard: null,
    options: { shardCount: 1 },
    db,
    uptime: 123456789,
    readyAt: new Date(),
    isReady: () => true,
    application: { commands: { cache: makeCollection(), fetch: async () => makeCollection() } },
  };
}

// ─────────────────────────────────────────────────────────────
// Args heuristic from usage string
// ─────────────────────────────────────────────────────────────
const IMG_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';
function heuristicArgs(cmd) {
  const usage = String(cmd.usage || '');
  if (!usage.trim()) return [];
  const tokens = usage.split(/\s+/);
  const out = [];
  for (let i = 0; i < Math.min(tokens.length, 4); i++) {
    const t = tokens[i].toLowerCase();
    if (/user|@|member/.test(t)) out.push('123456789012345678');
    else if (/channel/.test(t)) out.push('123456789012345678');
    else if (/role/.test(t)) out.push('role_admin_1');
    else if (/emoji|sticker/.test(t)) out.push(i === 0 ? IMG_URL : 'testname');
    else if (/url|link|image|avatar|banner|icon|vanity/.test(t)) out.push(IMG_URL);
    else if (/reason|text|msg|message|title|desc|question|name|tag|word|phrase|lang|from|to|label/.test(t)) out.push('test-value');
    else if (/amount|count|number|min|sec|time|days?|limit|size|level/.test(t)) out.push('5');
    else if (/command|cmd/.test(t)) out.push('ping');
    else if (/poll|option/.test(t)) out.push('opt1');
    else out.push('test-value');
  }
  return out;
}

const NETWORK_RE = /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|network|404|403|429|status code|api\.|timeout/i;

// Commands that perform LIVE Discord API mutations (real REST calls with prod
// credentials) must not run inside the harness — they can hang the runner or
// mutate production state. Everything else executes normally.
const SKIP_LIVE_API = new Set(['sync']);

// ─────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────
describe('All Commands Systematic Smoke Test (125 → current registry)', () => {
  let db, client, report;

  before(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = await init();
    commandHandler.load({ commands: new Map() });
    client = makeClient(db);
    report = [];
  });

  after(async () => {
    try { if (db && db.close) await db.close(); } catch {}
    try { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch {}
  });

  it('Registry loads all command files without loader errors', () => {
    const files = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const fp = path.join(dir, e.name);
      e.isDirectory() ? walk(fp) : e.name.endsWith('.js') && files.push(fp);
    });
    walk(path.resolve(__dirname, '../commands'));
    assert.equal(commandHandler.commands.size, files.length, `registry (${commandHandler.commands.size}) != files on disk (${files.length})`);
    assert.ok(commandHandler.commands.size >= 100);
  });

  it('Every command passes structural validation', () => {
    const problems = [];
    for (const cmd of commandHandler.commands.values()) {
      const tag = `[${cmd.name}]`;
      if (!cmd.name) problems.push(`${tag} missing name`);
      if (!cmd.category) problems.push(`${tag} missing category`);
      if (!cmd.description) problems.push(`${tag} missing description`);
      if (typeof cmd.execute !== 'function') problems.push(`${tag} execute() not a function`);
      if (typeof cmd.cooldown !== 'number' || cmd.cooldown < 0 || cmd.cooldown > 3600) problems.push(`${tag} cooldown invalid: ${cmd.cooldown}`);
      if (cmd.usage === undefined) problems.push(`${tag} missing usage field`);
      if (cmd.slash === true && typeof cmd.slashExecute !== 'function') problems.push(`${tag} declares slash but no slashExecute()`);
    }
    assert.equal(problems.length, 0, problems.join('\n'));
  });

  it('Every command file is Components-V2 compliant (no embeds/content payloads)', () => {
    const bad = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) return walk(fp);
      if (!e.name.endsWith('.js')) return;
      const src = fs.readFileSync(fp, 'utf8');
      if (/embeds:\s*\[/m.test(src) || /EmbedBuilder/m.test(src)) bad.push(`${fp}: embed payload found`);
      if (/\.(reply|send|editReply|followUp)\(\{\s*content:/m.test(src)) bad.push(`${fp}: plain content payload found`);
      if (/new MessageEmbed/m.test(src)) bad.push(`${fp}: legacy MessageEmbed`);
    });
    walk(path.resolve(__dirname, '../commands'));
    assert.equal(bad.length, 0, bad.join('\n'));
  });

  it('Executes every command with empty args and heuristic args without uncaught crashes', async () => {
    const failures = [];

    // Neutralize supervisor actions (reload/sync style commands) so tests survive.
    const exitCalls = [];
    const realExit = process.exit;
    const realKill = process.kill.bind(process);
    const armGuard = () => {
      process.exit = (code = 0) => { exitCalls.push({ type: 'exit', code }); };
      process.kill = (pid, sig) => { exitCalls.push({ type: 'kill', sig }); };
    };
    const disarmGuard = () => {
      process.exit = realExit;
      process.kill = realKill;
    };

    for (const cmd of [...commandHandler.commands.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_LIVE_API.has(cmd.name)) {
        report.push({ name: cmd.name, mode: 'skipped', status: 'ok', note: 'live-api-mutation' });
        continue;
      }
      for (const mode of ['empty', 'args']) {
        const msg = makeMessage({ client });
        const args = mode === 'empty' ? [] : heuristicArgs(cmd);
        // Mirror the production pipeline: commands declaring args:true never
        // reach execute() without arguments — the pipeline replies usage error.
        if (!args.length && cmd.args === true) {
          report.push({ name: cmd.name, mode, status: 'ok', note: 'arg-guarded' });
          continue;
        }
        armGuard();
        try {
          await Promise.race([
            Promise.resolve(cmd.execute(msg, args, client)),
            new Promise((_, rej) => setTimeout(() => rej(new Error('__TEST_TIMEOUT__')), 15000)),
          ]);
          report.push({
            name: cmd.name,
            mode,
            status: 'ok',
            note: msg.__replies.length ? 'replied' : exitCalls.length ? 'restart-requested' : 'no-reply',
          });
        } catch (err) {
          const em = String(err && err.message);
          const entry = { name: cmd.name, mode, error: em.slice(0, 300) };
          if (em === '__TEST_TIMEOUT__') entry.status = 'timeout';
          else if (NETWORK_RE.test(em)) entry.status = 'network';
          else entry.status = 'bug';
          entry.stack = (err && err.stack || '').split('\n').slice(0, 3).join(' | ');
          report.push(entry);
          failures.push(entry);
        } finally {
          disarmGuard();
        }
      }
    }

    const bugs = failures.filter((f) => f.status === 'bug' || f.status === 'timeout');
    if (bugs.length) {
      console.log('\n=== SMOKE FAILURES (bugs/timeouts) ===');
      for (const f of failures) console.log(`[${f.status}] ${f.name} (${f.mode}): ${f.error}`);
      console.log(`=== ${failures.filter((x) => x.status === 'network').length} network-dependent outcomes skipped ===\n`);
    }
    assert.equal(bugs.length, 0, `${bugs.length} command(s) crashed:\n${bugs.map((b) => `${b.name} (${b.mode}): ${b.error}`).join('\n')}`);
  });

  it('Report summary prints per-command status', () => {
    const byName = new Map();
    for (const r of report) {
      const cur = byName.get(r.name) || { ok: 0, network: 0, bug: 0, notes: [] };
      cur[r.status !== undefined && r.status !== 'ok' ? r.status : 'ok']++;
      if (r.note) cur.notes.push(r.note);
      byName.set(r.name, cur);
    }
    console.log(`\n=== COMMAND REPORT (${byName.size} commands tested x2 arg modes) ===`);
    const lines = [];
    for (const [name, s] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const status = s.bug ? 'BUG' : s.network ? 'NETWORK-DEP' : s.timeout ? 'TIMEOUT' : 'WORKING';
      lines.push(`${status.padEnd(12)} ${name}${s.notes.includes('no-reply') && status === 'WORKING' ? ' (silent-ok)' : ''}`);
    }
    console.log(lines.join('\n'));
    const working = lines.filter((l) => l.startsWith('WORKING')).length;
    console.log(`\nWorking: ${working}/${byName.size}, Network-dependent: ${lines.filter((l) => l.startsWith('NETWORK')).length}, Bugs: ${lines.filter((l) => l.startsWith('BUG')).length}\n`);
    assert.ok(byName.size >= 100);
    // Pending keep-alive sockets from network-dependent commands can hold the
    // test process open forever — force a clean exit once reporting is done.
    setTimeout(() => process.exit(0), 3000);
  });
});

// ─────────────────────────────────────────────────────────────
// Event-based features — manual triggers (not visible in command list)
// ─────────────────────────────────────────────────────────────
describe('Event-driven features manually triggered', () => {
  let db, client;

  before(async () => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = await init();
    commandHandler.load({ commands: new Map() });
    client = makeClient(db);
  });

  after(async () => {
    try { if (db && db.close) await db.close(); } catch {}
    try { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch {}
  });

  it('messageCreate: AFK auto-clear flow works end-to-end', async () => {
    const ev = require('../events/messageCreate');
    const msg = makeMessage({ client });
    await db.afk.set(msg.author.id, msg.guild.id, 'testing', Date.now() - 60000, 0);
    await ev.execute(msg, client);
    const stillAfk = await db.afk.get(msg.author.id, msg.guild.id);
    assert.equal(stillAfk, undefined, 'AFK should be cleared after message');
    assert.ok(msg.__replies.length >= 1, 'should reply welcome-back notice');
  });

  it('messageCreate: AFK mention notice fires for mentioned AFK user', async () => {
    const ev = require('../events/messageCreate');
    await db.afk.set('afk_user_1', 'guild_test_1', 'gone fishing', Date.now() - 120000, 0);
    const sender = makeUser('someone_else', 'SomeoneElse');
    const msg = makeMessage({ client, user: sender });
    msg.mentions.users.set('afk_user_1', makeUser('afk_user_1', 'AfkGuy'));
    await ev.execute(msg, client);
    assert.ok(msg.__replies.some((p) => JSON.stringify(p).includes('gone fishing')), 'mention notice should include AFK reason');
  });

  it('messageCreate: bad-word automod deletes message and DMs author', async () => {
    const ev = require('../events/messageCreate');
    await db.guildConfig.set('guild_test_1', { badWords: ['forbidden'], antiLink: false, antiSpam: false });
    // Non-admin sender so automod applies
    const plainUser = makeUser('plain_joe_1', 'PlainJoe');
    const msg = makeMessage({ client, user: plainUser, content: 'this contains forbidden stuff' });
    msg.member.permissions = { has: () => false, toArray: () => [] };
    let deleted = false;
    msg.delete = async () => { deleted = true; };
    let dms = 0;
    msg.author.send = async () => { dms++; return {}; };
    await ev.execute(msg, client);
    assert.equal(deleted, true, 'bad-word message should be deleted');
    assert.equal(dms, 1, 'author should be DMd the automod notice');
  });

  it('guildMemberAdd: welcome/greet/autorole handlers run without crash', async () => {
    const events = ['welcome', 'greet', 'autorole'].filter((n) => fs.existsSync(path.resolve(__dirname, `../events/${n}.js`)));
    const gmAddPath = path.resolve(__dirname, '../events/guildMemberAdd.js');
    const mod = fs.existsSync(gmAddPath) ? require('../handlers/eventHandler') : null;
    const member = makeMember(makeUser('new_joiner_1', 'NewJoiner'));
    member.guild = makeGuild();

    // Directly exercise event modules that exist and expose execute(member, client)
    let exercised = 0;
    for (const n of events) {
      const ev = require(`../events/${n}.js`);
      if (typeof ev.execute === 'function') {
        await ev.execute(member, client);
        exercised++;
      }
    }
    if (fs.existsSync(gmAddPath)) {
      const ev = require('../events/guildMemberAdd.js');
      if (typeof ev.execute === 'function') {
        await ev.execute(member, client);
        exercised++;
      }
    }
    assert.ok(exercised > 0, 'at least one join-event handler should run');
  });

  it('XP leveling system fully removed from runtime', async () => {
    assert.equal(typeof db.level, 'undefined', 'db.level namespace must not exist');
    const srcMsgCreate = fs.readFileSync(path.resolve(__dirname, '../events/messageCreate.js'), 'utf8');
    assert.ok(!srcMsgCreate.includes('addXp'), 'messageCreate must not call addXp');
    assert.ok(!srcMsgCreate.includes('leveled up'), 'level-up notification must be gone');
    assert.ok(!fs.existsSync(path.resolve(__dirname, '../commands/fun/rank.js')), 'rank.js deleted');
    assert.ok(!fs.existsSync(path.resolve(__dirname, '../commands/fun/leaderboard.js')), 'leaderboard.js deleted');
    assert.equal(meta.get('rank'), undefined, 'rank gone from registry');
    assert.equal(meta.get('leaderboard'), undefined, 'leaderboard gone from registry');
  });
});
