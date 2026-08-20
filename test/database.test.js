// test/database.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { init } = require('../utils/db');

describe('Database Parity & Operational Integrity (SQLite Driver)', () => {
  const testDbFile = path.resolve(__dirname, '../data/test_bot.db');
  let db;

  before(async () => {
    process.env.SQLITE_PATH = './data/test_bot.db';
    if (fs.existsSync(testDbFile)) {
      try { fs.unlinkSync(testDbFile); } catch {}
    }
    db = await init();
  });

  after(async () => {
    if (db && typeof db.close === 'function') {
      await db.close();
    }
    if (fs.existsSync(testDbFile)) {
      try { fs.unlinkSync(testDbFile); } catch {}
    }
  });

  it('Initializes successfully with healthCheck status "healthy"', async () => {
    const health = await db.healthCheck();
    assert.equal(health.status, 'healthy');
    assert.equal(health.sqlite, true);
  });

  it('UPI: set, list, remove', () => {
    db.upi.set('user_1', 'default', 'user1@upi');
    db.upi.set('user_1', 'work', 'work@upi');
    const list = db.upi.list('user_1');
    assert.equal(list.length, 2);
    assert.equal(list[0].label, 'default');

    const removed = db.upi.remove('user_1', 'work');
    assert.equal(removed, true);
    assert.equal(db.upi.list('user_1').length, 1);
  });

  it('AFK: set, get, setDm, remove', () => {
    db.afk.set('user_1', 'guild_1', 'Eating lunch', Date.now(), 1);
    const afk = db.afk.get('user_1', 'guild_1');
    assert.ok(afk);
    assert.equal(afk.reason, 'Eating lunch');
    assert.equal(afk.dmOnMention, 1);

    db.afk.setDm('user_1', 'guild_1', 0);
    assert.equal(db.afk.get('user_1', 'guild_1').dmOnMention, 0);

    db.afk.remove('user_1', 'guild_1');
    assert.equal(db.afk.get('user_1', 'guild_1'), undefined);
  });

  it('Tags: set, get, incrementUses, list, delete', () => {
    db.tag.set('guild_1', 'rules', '1. Be nice\n2. No spam', 'admin_1');
    const tag = db.tag.get('guild_1', 'rules');
    assert.ok(tag);
    assert.equal(tag.name, 'rules');
    assert.equal(tag.content, '1. Be nice\n2. No spam');

    db.tag.incrementUses('guild_1', 'rules');
    const updated = db.tag.get('guild_1', 'rules');
    assert.equal(updated.uses, 1);

    const list = db.tag.list('guild_1');
    assert.equal(list.length, 1);

    db.tag.delete('guild_1', 'rules');
    assert.equal(db.tag.get('guild_1', 'rules'), undefined);
  });

  it('Command Whitelist: add, isWhitelisted, list, remove, clear', () => {
    db.cmdWhitelist.add('user_1', 'guild_1', 'admin_1');
    assert.equal(db.cmdWhitelist.isWhitelisted('user_1', 'guild_1'), true);
    assert.equal(db.cmdWhitelist.isWhitelisted('user_2', 'guild_1'), false);

    const list = db.cmdWhitelist.list('guild_1');
    assert.equal(list.length, 1);
    assert.equal(list[0].userId, 'user_1');

    db.cmdWhitelist.remove('user_1', 'guild_1');
    assert.equal(db.cmdWhitelist.isWhitelisted('user_1', 'guild_1'), false);
  });

  it('GuildConfig: set, get, update partial fields', () => {
    db.guildConfig.set('guild_1', {
      prefix: '!',
      badWords: ['testbad'],
      antiLink: true,
      antiSpam: true,
    });

    const cfg = db.guildConfig.get('guild_1');
    assert.equal(cfg.prefix, '!');
    assert.equal(cfg.antiLink, true);
    assert.equal(cfg.antiSpam, true);
    assert.deepEqual(cfg.badWords, ['testbad']);

    db.guildConfig.set('guild_1', { prefix: '?' });
    const updated = db.guildConfig.get('guild_1');
    assert.equal(updated.prefix, '?');
    assert.equal(updated.antiLink, true); // Retains previous fields
  });

  it('Warns: add, list, clear, clearGuild', () => {
    db.warn.add('user_1', 'guild_1', 'mod_1', 'Spamming', Date.now());
    db.warn.add('user_1', 'guild_1', 'mod_1', 'Disrespect', Date.now());
    db.warn.add('user_2', 'guild_1', 'mod_1', 'Bad word', Date.now());

    assert.equal(db.warn.list('user_1', 'guild_1').length, 2);
    db.warn.clear('user_1', 'guild_1');
    assert.equal(db.warn.list('user_1', 'guild_1').length, 0);
    assert.equal(db.warn.list('user_2', 'guild_1').length, 1);

    db.warn.clearGuild('guild_1');
    assert.equal(db.warn.list('user_2', 'guild_1').length, 0);
  });

  it('Levels / XP: addXp, get, setLevel, top', () => {
    const ts = Date.now();
    const u1 = `user_xp_${ts}_1`;
    const u2 = `user_xp_${ts}_2`;
    const g1 = `guild_xp_${ts}`;

    const res = db.level.addXp(u1, g1, 50);
    assert.equal(res.xp, 50);
    assert.equal(res.level, 0);

    db.level.setLevel(u1, g1, 1);
    assert.equal(db.level.get(u1, g1).level, 1);

    db.level.addXp(u2, g1, 100);
    const top = db.level.top(g1, 5);
    assert.equal(top.length, 2);
    assert.equal(top[0].userId, u2);
  });

  it('UserReminders & Timers: add, due, markFired, list, remove', () => {
    const ts = Date.now();
    const uid = `user_rem_${ts}`;
    const past = ts - 5000;
    const future = ts + 100000;

    const rId1 = db.userReminder.add(uid, 'chan_1', 'guild_1', 'Take meds', past, past);
    const rId2 = db.userReminder.add(uid, 'chan_1', 'guild_1', 'Future thing', ts, future);

    const list = db.userReminder.list(uid);
    assert.equal(list.length, 2);

    db.userReminder.markFired(rId1);
    const listAfterFired = db.userReminder.list(uid);
    assert.equal(listAfterFired.length, 1);
    assert.equal(listAfterFired[0].reason, 'Future thing');

    db.userReminder.remove(rId2);
    assert.equal(db.userReminder.list(uid).length, 0);
  });

  it('Transcripts namespace: add, get, expired, delete', () => {
    const ts = Date.now();
    const id1 = `tx_${ts}_1`;
    const id2 = `tx_${ts}_2`;
    db.transcript.add(id1, 'guild_1', 'chan_1', 'user_1', ts - 100000);
    db.transcript.add(id2, 'guild_1', 'chan_1', 'user_1', ts);

    const record = db.transcript.get(id1);
    assert.ok(record);
    assert.equal(record.guildId, 'guild_1');

    const expired = db.transcript.expired(ts - 50000);
    assert.ok(expired.includes(id1));
    assert.ok(!expired.includes(id2));

    db.transcript.delete(id1);
    assert.equal(db.transcript.get(id1), null);
    db.transcript.delete(id2);
  });
});
