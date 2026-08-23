// test/afkFlowDebug.test.js
// End-to-end reproduction of the reported AFK bug:
// ?afk <reason> -> button click -> DB write -> another user mentions the AFK
// user in a message -> messageCreate should reply with the 💤 AFK notice.

process.env.DB_SQLITE_PATH = './data/test_afk.db';

process.env.OWNER_ID = process.env.OWNER_ID || 'test_owner_id';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { init } = require('../utils/db');
const { sqlitePath: afkSqlitePath } = require('../utils/config');

// SAFETY GUARD: tests must never touch the production database.
if (!String(afkSqlitePath).includes('data/test_')) {
  throw new Error(`SAFETY GUARD: tests resolved to non-test database "${afkSqlitePath}". Aborting.`);
}
const afkCmd = require('../commands/utility/afk');
const msgCreate = require('../events/messageCreate');

// Minimal mocks (same shape as allCommandsSmoke harness)
function makeCollection(entries = []) {
  const m = new Map(entries);
  const col = {
    get size() { return m.size; },
    get: (k) => m.get(k), set: (k, v) => { m.set(k, v); return col; },
    has: (k) => m.has(k), delete: (k) => m.delete(k),
    values: () => m.values(), keys: () => m.keys(), entries: () => m.entries(),
    forEach: (fn) => m.forEach(fn),
    map: (fn) => [...m.values()].map(fn),
    filter: (fn) => makeCollection([...m].filter(([, v]) => fn(v))),
    find: (fn) => [...m.values()].find(fn),
    first: () => [...m.values()][0],
    last: () => [...m.values()][m.size - 1],
    [Symbol.iterator]: () => m[Symbol.iterator](),
  };
  return col;
}

function makeUser(id, username = `u_${id.slice(-4)}`) {
  return {
    id, username, tag: `${username}#0001`, bot: false,
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    flags: { has: () => false, toArray: () => [] },
    send: async (p) => ({ id: `dm_${Math.random()}`, __dmPayload: p }),
    toString: () => `<@${id}>`,
  };
}

function makeGuild() {
  return {
    id: 'guild_afk_1', name: 'AFK Guild', ownerId: 'guild_owner_1', memberCount: 10,
    members: { cache: makeCollection(), fetch: async () => { throw new Error('Unknown Member'); } },
    roles: { cache: makeCollection(), everyone: {} },
    channels: { cache: makeCollection() },
    me: { permissions: { has: () => true } },
  };
}

function makeMember(user) {
  return {
    id: user.id, user, displayName: user.username, nickname: null,
    permissions: { has: () => true },
    roles: { cache: makeCollection(), highest: { position: 5 }, add: async () => {}, remove: async () => {} },
    setNickname: async (n) => { member.__nickname = n; },
    timeout: async () => {},
    ban: async () => {}, kick: async () => {},
    toString: () => `<@${user.id}>`,
  };
  var member;
}

function makeMessage({ user, content, mentionedUsers = [] }) {
  const guild = makeGuild();
  const member = makeMember(user);
  member.guild = guild;
  const replies = [];
  let nicknameSetTo = undefined;
  member.setNickname = async (n) => { nicknameSetTo = n; };
  member.__getNickname = () => nicknameSetTo;

  const msg = {
    id: `msg_${Math.random().toString(36).slice(2, 8)}`,
    content,
    author: user,
    member,
    guild,
    channel: {
      id: 'chan_1', type: 0, send: async (p) => ({ id: `sent_${Math.random()}`, __payload: p }),
      messages: { fetch: async () => makeCollection() },
    },
    client: null,
    createdTimestamp: Date.now(),
    deletable: true,
    attachments: makeCollection(),
    mentions: {
      users: makeCollection(mentionedUsers.map((u) => [u.id, u])),
      members: makeCollection(),
      roles: makeCollection(),
      channels: makeCollection(),
    },
    reference: null,
    reply: async (p) => { replies.push(p); return msg; },
    delete: async () => {},
    edit: async () => msg,
    createMessageComponentCollector: () => ({
      on: () => {}, once: () => {}, stop: () => {},
    }),
    __replies: replies,
  };
  msg.member = member;
  return msg;
}

describe('AFK end-to-end bug reproduction', () => {
  let db;

  before(async () => {
    const f = path.resolve(__dirname, '../data/test_afk.db');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    db = await init();
  });

  after(async () => {
    try { if (db && db.close) await db.close(); } catch {}
    try { fs.unlinkSync(path.resolve(__dirname, '../data/test_afk.db')); } catch {}
  });

  it('FULL FLOW: afk set via button -> mention -> notice fires', async () => {
    // ── Step 1: afk user runs ?afk busy ──
    const afkUser = makeUser('afk_guy_1', 'AfkGuy');
    const setMsg = makeMessage({ user: afkUser, content: '?afk busy' });

    // Capture the collector from the prompt message
    let collectorHandlers = {};
    setMsg.reply = async (p) => {
      console.log('[DEBUG] reply() called, payload type:', typeof p, '| has components:', !!p?.components);
      setMsg.__replies.push(p);
      const promptMsg = { ...setMsg, id: 'prompt_1' };
      promptMsg.createMessageComponentCollector = () => {
        console.log('[DEBUG] createMessageComponentCollector CALLED');
        return {
          on: (ev, fn) => { console.log('[DEBUG] collector.on(', ev, ') registered'); collectorHandlers[ev] = fn; },
          stop: () => {},
        };
      };
      promptMsg.edit = async () => promptMsg;
      return promptMsg;
    };

    let execErr = null;
    try {
      await afkCmd.execute(setMsg, ['busy'], { user: makeUser('bot_user_id', 'Pixel-Assistor') });
    } catch (e) {
      execErr = e;
    }
    if (execErr) {
      console.log('[DEBUG] afk.execute THREW:', execErr.stack);
      throw execErr;
    }
    console.log('[DEBUG] replies after execute:', setMsg.__replies.length,
      '| payload:', JSON.stringify(setMsg.__replies[0]?.components?.map?.((c) => c.toJSON ? c.toJSON() : c)).slice(0, 300));
    assert.ok(collectorHandlers.collect, 'collector should be listening');

    // ── Step 2: user clicks "No" button (DM off) ──
    await collectorHandlers.collect(
      { customId: `afk_afk_guy_1_no`, user: afkUser, update: async () => {} },
    );

    // ── Step 3: verify DB row exactly as messageCreate will read it ──
    const row = db.afk.get('afk_guy_1', 'guild_afk_1');
    console.log('\n[DEBUG] DB row after activation:', JSON.stringify(row));
    assert.ok(row, 'AFK row must exist after button click');
    assert.equal(row.reason, 'busy');

    // ── Step 4: another user mentions the AFK guy ──
    const other = makeUser('chatter_1', 'Chatter');
    const mentionMsg = makeMessage({
      user: other,
      content: 'hey <@afk_guy_1> are you there?',
      mentionedUsers: [makeUser('afk_guy_1', 'AfkGuy')],
    });

    await msgCreate.execute(mentionMsg, { user: makeUser('bot_user_id', 'Pixel-Assistor'), ws: { ping: 30 } });

    console.log('[DEBUG] mention msg replies:', JSON.stringify(mentionMsg.__replies).slice(0, 400));
    assert.ok(
      mentionMsg.__replies.some((p) => JSON.stringify(p).includes('is AFK')),
      'messageCreate must reply with the AFK notice when an AFK user is mentioned',
    );
  });
});
