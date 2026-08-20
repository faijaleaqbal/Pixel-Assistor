// src/utils/db.js
// Dual DB driver — SQLite (always) + MongoDB (optional).
//
// SQLite handles ALL data (full fallback).
// MongoDB handles complex data when available (preferred).
// If MongoDB is disabled/missing, SQLite takes over — zero commands break.
//
// Commands just call getDb().namespace.method() — routing is handled here.

const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

let sql = null;
let mongo = null;
let unified = null;
let rawSqliteDb = null;

// ─────────────────────────────────────────────────────────────
//  SQLite — ALL data (complete fallback)
// ─────────────────────────────────────────────────────────────
function makeSqlite() {
  const Database = require('better-sqlite3');
  const dbFile = path.resolve(process.cwd(), config.sqlitePath || './data/bot.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  rawSqliteDb = db;
  db.pragma('journal_mode = WAL');

  db.exec(`
    -- Core Tables --
    CREATE TABLE IF NOT EXISTS upi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      label TEXT NOT NULL,
      upiId TEXT NOT NULL,
      UNIQUE(userId, label)
    );
    CREATE TABLE IF NOT EXISTS afk (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      reason TEXT,
      since INTEGER,
      dmOnMention INTEGER DEFAULT 0,
      PRIMARY KEY(userId, guildId)
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      createdBy TEXT,
      createdAt INTEGER,
      uses INTEGER DEFAULT 0,
      UNIQUE(guildId, name)
    );
    CREATE TABLE IF NOT EXISTS cmd_whitelist (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      addedBy TEXT NOT NULL,
      addedAt INTEGER NOT NULL,
      PRIMARY KEY(userId, guildId)
    );
    CREATE TABLE IF NOT EXISTS ignored (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      UNIQUE(guildId, type, target)
    );

    -- Guild & Admin Tables --
    CREATE TABLE IF NOT EXISTS antinuke_config (
      guildId TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      logChannel TEXT,
      punishment TEXT DEFAULT 'ban',
      owners TEXT DEFAULT '[]',
      whitelist TEXT DEFAULT '[]',
      wlRoles TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS greet_config (
      guildId TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      channels TEXT DEFAULT '[]',
      message TEXT,
      title TEXT,
      description TEXT,
      footer TEXT,
      image TEXT,
      thumbnail TEXT,
      embed INTEGER DEFAULT 1,
      ping INTEGER DEFAULT 1,
      autoDelete INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS guild_config (
      guildId TEXT PRIMARY KEY,
      logChannel TEXT,
      autoRoleId TEXT,
      welcomeChannel TEXT,
      welcomeMsg TEXT,
      leaveChannel TEXT,
      leaveMsg TEXT,
      badWords TEXT DEFAULT '[]',
      antiLink INTEGER DEFAULT 0,
      antiSpam INTEGER DEFAULT 0,
      adminRoles TEXT DEFAULT '[]',
      modRoles TEXT DEFAULT '[]',
      ownerRoles TEXT DEFAULT '[]',
      autoRoleBot TEXT,
      autoRoleHuman TEXT,
      modLimit INTEGER,
      adminModLimit INTEGER,
      modModLimit INTEGER,
      prefix TEXT
    );
    CREATE TABLE IF NOT EXISTS warn (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      moderatorId TEXT,
      reason TEXT,
      at INTEGER
    );
    CREATE TABLE IF NOT EXISTS levels (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      PRIMARY KEY(userId, guildId)
    );
    CREATE TABLE IF NOT EXISTS persist_role (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      roleIds TEXT DEFAULT '[]',
      PRIMARY KEY(userId, guildId)
    );
    CREATE TABLE IF NOT EXISTS reaction_stat (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      wins INTEGER DEFAULT 0,
      PRIMARY KEY(userId, guildId)
    );
    CREATE TABLE IF NOT EXISTS rps_stat (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      ties INTEGER DEFAULT 0,
      PRIMARY KEY(userId, guildId)
    );
    CREATE TABLE IF NOT EXISTS crypto_balance (
      userId TEXT NOT NULL,
      coin TEXT NOT NULL,
      amount REAL DEFAULT 0,
      PRIMARY KEY(userId, coin)
    );
    CREATE TABLE IF NOT EXISTS reminder (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      at INTEGER NOT NULL,
      message TEXT
    );
    CREATE TABLE IF NOT EXISTS user_reminder (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      reason TEXT,
      createdAt INTEGER,
      triggerAt INTEGER,
      fired INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS timer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      reason TEXT,
      createdAt INTEGER,
      triggerAt INTEGER,
      messageId TEXT,
      fired INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      authorId TEXT NOT NULL,
      content TEXT,
      attachmentUrl TEXT,
      attachmentName TEXT,
      createdAt INTEGER,
      triggerAt INTEGER,
      sent INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      generatedBy TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    -- Performance Indexes --
    CREATE INDEX IF NOT EXISTS idx_warn_user_guild ON warn(userId, guildId);
    CREATE INDEX IF NOT EXISTS idx_warn_guild ON warn(guildId);
    CREATE INDEX IF NOT EXISTS idx_tags_guild_name ON tags(guildId, name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_user_reminder_due ON user_reminder(triggerAt, fired);
    CREATE INDEX IF NOT EXISTS idx_user_reminder_user ON user_reminder(userId);
    CREATE INDEX IF NOT EXISTS idx_timer_due ON timer(triggerAt, fired);
    CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_messages(triggerAt, sent);
    CREATE INDEX IF NOT EXISTS idx_transcripts_created ON transcripts(createdAt);
  `);

  // Migrations
  try { db.exec('ALTER TABLE afk ADD COLUMN dmOnMention INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE guild_config ADD COLUMN modLimit INTEGER'); } catch {}
  try { db.exec('ALTER TABLE guild_config ADD COLUMN adminModLimit INTEGER'); } catch {}
  try { db.exec('ALTER TABLE guild_config ADD COLUMN modModLimit INTEGER'); } catch {}
  try { db.exec('ALTER TABLE guild_config ADD COLUMN prefix TEXT'); } catch {}

  // JSON helpers
  const j = (s, fallback = []) => {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  };

  return {
    _raw: db,

    // ── UPI ─────────────────────────────
    upi: {
      list: (userId) => db.prepare('SELECT label, upiId FROM upi WHERE userId=?').all(userId),
      set: (userId, label, upiId) =>
        db.prepare('INSERT OR REPLACE INTO upi (userId, label, upiId) VALUES (?,?,?)').run(userId, label, upiId),
      remove: (userId, label) =>
        db.prepare('DELETE FROM upi WHERE userId=? AND label=?').run(userId, label).changes > 0,
    },

    // ── AFK ─────────────────────────────
    afk: {
      get: (userId, guildId) => db.prepare('SELECT reason, since, dmOnMention FROM afk WHERE userId=? AND guildId=?').get(userId, guildId),
      set: (userId, guildId, reason, since, dmOnMention = 0) =>
        db.prepare('INSERT OR REPLACE INTO afk (userId, guildId, reason, since, dmOnMention) VALUES (?,?,?,?,?)').run(userId, guildId, reason, since, dmOnMention ? 1 : 0),
      setDm: (userId, guildId, dmOnMention) =>
        db.prepare('UPDATE afk SET dmOnMention=? WHERE userId=? AND guildId=?').run(dmOnMention ? 1 : 0, userId, guildId).changes > 0,
      remove: (userId, guildId) =>
        db.prepare('DELETE FROM afk WHERE userId=? AND guildId=?').run(userId, guildId).changes > 0,
    },

    // ── Tags ────────────────────────────
    tag: {
      get: (guildId, name) => db.prepare('SELECT * FROM tags WHERE guildId=? AND name=? COLLATE NOCASE').get(guildId, name),
      set: (guildId, name, content, createdBy) =>
        db.prepare('INSERT OR REPLACE INTO tags (guildId, name, content, createdBy, createdAt, uses) VALUES (?,?,?,?,?,0)').run(guildId, name.toLowerCase(), content, createdBy, Date.now()),
      delete: (guildId, name) => db.prepare('DELETE FROM tags WHERE guildId=? AND name=? COLLATE NOCASE').run(guildId, name).changes > 0,
      list: (guildId) => db.prepare('SELECT name, createdBy, uses FROM tags WHERE guildId=? ORDER BY name').all(guildId),
      all: (guildId) => db.prepare('SELECT name FROM tags WHERE guildId=?').all(guildId),
      incrementUses: (guildId, name) => db.prepare('UPDATE tags SET uses=uses+1 WHERE guildId=? AND name=? COLLATE NOCASE').run(guildId, name),
    },

    // ── Command Whitelist ───────────────
    cmdWhitelist: {
      add: (userId, guildId, addedBy) =>
        db.prepare('INSERT OR IGNORE INTO cmd_whitelist (userId, guildId, addedBy, addedAt) VALUES (?,?,?,?)').run(userId, guildId, addedBy, Date.now()).changes > 0,
      remove: (userId, guildId) =>
        db.prepare('DELETE FROM cmd_whitelist WHERE userId=? AND guildId=?').run(userId, guildId).changes > 0,
      list: (guildId) =>
        db.prepare('SELECT userId, addedBy, addedAt FROM cmd_whitelist WHERE guildId=? ORDER BY addedAt DESC').all(guildId),
      isWhitelisted: (userId, guildId) =>
        !!db.prepare('SELECT 1 FROM cmd_whitelist WHERE userId=? AND guildId=?').get(userId, guildId),
      clear: (guildId) =>
        db.prepare('DELETE FROM cmd_whitelist WHERE guildId=?').run(guildId).changes,
    },

    // ── Ignored ─────────────────────────
    ignored: {
      get: (guildId, type, target) => db.prepare('SELECT * FROM ignored WHERE guildId=? AND type=? AND target=?').get(guildId, type, target),
      add: (guildId, type, target) =>
        db.prepare('INSERT OR IGNORE INTO ignored (guildId, type, target) VALUES (?,?,?)').run(guildId, type, target),
      remove: (guildId, type, target) => db.prepare('DELETE FROM ignored WHERE guildId=? AND type=? AND target=?').run(guildId, type, target).changes > 0,
      list: (guildId, type) => db.prepare('SELECT target FROM ignored WHERE guildId=? AND type=?').all(guildId, type).map((r) => r.target),
      clear: (guildId, type) => db.prepare('DELETE FROM ignored WHERE guildId=? AND type=?').run(guildId, type),
    },

    // ── AntiNuke ────────────────────────
    antinuke: {
      get: (guildId) => {
        const r = db.prepare('SELECT * FROM antinuke_config WHERE guildId=?').get(guildId);
        if (!r) return null;
        return {
          guildId: r.guildId,
          enabled: r.enabled === 1,
          logChannel: r.logChannel,
          punishment: r.punishment || 'ban',
          owners: j(r.owners),
          whitelist: j(r.whitelist),
          wlRoles: j(r.wlRoles),
        };
      },
      set: (guildId, data) => {
        const ex = db.prepare('SELECT * FROM antinuke_config WHERE guildId=?').get(guildId);
        const base = ex ? {
          enabled: ex.enabled === 1, logChannel: ex.logChannel,
          punishment: ex.punishment, owners: j(ex.owners),
          whitelist: j(ex.whitelist), wlRoles: j(ex.wlRoles),
        } : { enabled: false, punishment: 'ban', owners: [], whitelist: [], wlRoles: [] };
        const m = { ...base, ...data, guildId };
        db.prepare(`INSERT INTO antinuke_config (guildId,enabled,logChannel,punishment,owners,whitelist,wlRoles)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(guildId) DO UPDATE SET
          enabled=excluded.enabled, logChannel=excluded.logChannel, punishment=excluded.punishment,
          owners=excluded.owners, whitelist=excluded.whitelist, wlRoles=excluded.wlRoles`)
          .run(guildId, m.enabled ? 1 : 0, m.logChannel || null, m.punishment || 'ban',
            JSON.stringify(m.owners || []), JSON.stringify(m.whitelist || []), JSON.stringify(m.wlRoles || []));
        return m;
      },
    },

    // ── Greet ───────────────────────────
    greet: {
      get: (guildId) => {
        const r = db.prepare('SELECT * FROM greet_config WHERE guildId=?').get(guildId);
        if (!r) return null;
        return {
          guildId: r.guildId,
          enabled: r.enabled === 1,
          channels: j(r.channels),
          message: r.message,
          title: r.title,
          description: r.description,
          footer: r.footer,
          image: r.image,
          thumbnail: r.thumbnail,
          embed: r.embed === 1,
          ping: r.ping === 1,
          autoDelete: r.autoDelete || 0,
        };
      },
      set: (guildId, data) => {
        const ex = db.prepare('SELECT * FROM greet_config WHERE guildId=?').get(guildId);
        const base = ex ? {
          enabled: ex.enabled === 1, channels: j(ex.channels),
          message: ex.message, title: ex.title, description: ex.description,
          footer: ex.footer, image: ex.image, thumbnail: ex.thumbnail,
          embed: ex.embed === 1, ping: ex.ping === 1, autoDelete: ex.autoDelete || 0,
        } : {
          enabled: false, channels: [], message: null, title: null, description: null,
          footer: null, image: null, thumbnail: null, embed: true, ping: true, autoDelete: 0,
        };
        const m = { ...base, ...data, guildId };
        db.prepare(`INSERT INTO greet_config (guildId,enabled,channels,message,title,description,footer,image,thumbnail,embed,ping,autoDelete)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guildId) DO UPDATE SET
          enabled=excluded.enabled, channels=excluded.channels, message=excluded.message,
          title=excluded.title, description=excluded.description, footer=excluded.footer,
          image=excluded.image, thumbnail=excluded.thumbnail, embed=excluded.embed,
          ping=excluded.ping, autoDelete=excluded.autoDelete`)
          .run(guildId,
            m.enabled ? 1 : 0,
            JSON.stringify(m.channels || []),
            m.message || null,
            m.title || null,
            m.description || null,
            m.footer || null,
            m.image || null,
            m.thumbnail || null,
            m.embed !== undefined ? (m.embed ? 1 : 0) : 1,
            m.ping !== undefined ? (m.ping ? 1 : 0) : 1,
            m.autoDelete || 0
          );
        return m;
      },
    },

    // ── Guild Config ───────────────────
    guildConfig: {
      get: (guildId) => {
        const r = db.prepare('SELECT * FROM guild_config WHERE guildId=?').get(guildId);
        if (!r) return null;
        return {
          guildId: r.guildId,
          logChannel: r.logChannel,
          autoRoleId: r.autoRoleId,
          welcomeChannel: r.welcomeChannel,
          welcomeMsg: r.welcomeMsg,
          leaveChannel: r.leaveChannel,
          leaveMsg: r.leaveMsg,
          badWords: j(r.badWords),
          antiLink: r.antiLink === 1,
          antiSpam: r.antiSpam === 1,
          adminRoles: j(r.adminRoles),
          modRoles: j(r.modRoles),
          ownerRoles: j(r.ownerRoles),
          autoRoleBot: r.autoRoleBot,
          autoRoleHuman: r.autoRoleHuman,
          modLimit: r.modLimit != null ? r.modLimit : null,
          adminModLimit: r.adminModLimit != null ? r.adminModLimit : null,
          modModLimit: r.modModLimit != null ? r.modModLimit : null,
          prefix: r.prefix || null,
        };
      },
      set: (guildId, data) => {
        const ex = db.prepare('SELECT * FROM guild_config WHERE guildId=?').get(guildId);
        const base = ex ? {
          logChannel: ex.logChannel, autoRoleId: ex.autoRoleId,
          welcomeChannel: ex.welcomeChannel, welcomeMsg: ex.welcomeMsg,
          leaveChannel: ex.leaveChannel, leaveMsg: ex.leaveMsg,
          badWords: j(ex.badWords), antiLink: ex.antiLink === 1, antiSpam: ex.antiSpam === 1,
          adminRoles: j(ex.adminRoles), modRoles: j(ex.modRoles), ownerRoles: j(ex.ownerRoles),
          autoRoleBot: ex.autoRoleBot, autoRoleHuman: ex.autoRoleHuman,
          modLimit: ex.modLimit != null ? ex.modLimit : null,
          adminModLimit: ex.adminModLimit != null ? ex.adminModLimit : null,
          modModLimit: ex.modModLimit != null ? ex.modModLimit : null,
          prefix: ex.prefix || null,
        } : {
          badWords: [], antiLink: false, antiSpam: false,
          adminRoles: [], modRoles: [], ownerRoles: [],
          modLimit: null, adminModLimit: null, modModLimit: null, prefix: null,
        };
        const m = { ...base, ...data, guildId };
        db.prepare(`INSERT INTO guild_config (guildId,logChannel,autoRoleId,welcomeChannel,welcomeMsg,leaveChannel,leaveMsg,badWords,antiLink,antiSpam,adminRoles,modRoles,ownerRoles,autoRoleBot,autoRoleHuman,modLimit,adminModLimit,modModLimit,prefix)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guildId) DO UPDATE SET
          logChannel=excluded.logChannel, autoRoleId=excluded.autoRoleId,
          welcomeChannel=excluded.welcomeChannel, welcomeMsg=excluded.welcomeMsg,
          leaveChannel=excluded.leaveChannel, leaveMsg=excluded.leaveMsg,
          badWords=excluded.badWords, antiLink=excluded.antiLink, antiSpam=excluded.antiSpam,
          adminRoles=excluded.adminRoles, modRoles=excluded.modRoles, ownerRoles=excluded.ownerRoles,
          autoRoleBot=excluded.autoRoleBot, autoRoleHuman=excluded.autoRoleHuman,
          modLimit=excluded.modLimit, adminModLimit=excluded.adminModLimit, modModLimit=excluded.modModLimit,
          prefix=excluded.prefix`)
          .run(guildId,
            m.logChannel || null,
            m.autoRoleId || null,
            m.welcomeChannel || null,
            m.welcomeMsg || null,
            m.leaveChannel || null,
            m.leaveMsg || null,
            JSON.stringify(m.badWords || []),
            m.antiLink ? 1 : 0,
            m.antiSpam ? 1 : 0,
            JSON.stringify(m.adminRoles || []),
            JSON.stringify(m.modRoles || []),
            JSON.stringify(m.ownerRoles || []),
            m.autoRoleBot || null,
            m.autoRoleHuman || null,
            m.modLimit == null ? null : Number(m.modLimit),
            m.adminModLimit == null ? null : Number(m.adminModLimit),
            m.modModLimit == null ? null : Number(m.modModLimit),
            m.prefix || null
          );
        return m;
      },
    },

    // ── Warnings ────────────────────────
    warn: {
      add: (userId, guildId, moderatorId, reason, at) => {
        const info = db.prepare('INSERT INTO warn (userId, guildId, moderatorId, reason, at) VALUES (?,?,?,?,?)').run(userId, guildId, moderatorId, reason, at);
        return info.lastInsertRowid;
      },
      list: (userId, guildId) =>
        db.prepare('SELECT * FROM warn WHERE userId=? AND guildId=? ORDER BY at DESC').all(userId, guildId),
      clear: (userId, guildId) =>
        db.prepare('DELETE FROM warn WHERE userId=? AND guildId=?').run(userId, guildId).changes,
      clearGuild: (guildId) =>
        db.prepare('DELETE FROM warn WHERE guildId=?').run(guildId).changes,
    },

    // ── Levels / XP ─────────────────────
    level: {
      get: (userId, guildId) => {
        const r = db.prepare('SELECT xp, level FROM levels WHERE userId=? AND guildId=?').get(userId, guildId);
        return r || { xp: 0, level: 0 };
      },
      addXp: (userId, guildId, xp) => {
        db.prepare(`INSERT INTO levels (userId, guildId, xp, level) VALUES (?,?,?,0)
          ON CONFLICT(userId, guildId) DO UPDATE SET xp=xp+excluded.xp`)
          .run(userId, guildId, xp);
        const r = db.prepare('SELECT xp, level FROM levels WHERE userId=? AND guildId=?').get(userId, guildId);
        return r;
      },
      setLevel: (userId, guildId, level) =>
        db.prepare(`INSERT INTO levels (userId, guildId, xp, level) VALUES (?,?,0,?)
          ON CONFLICT(userId, guildId) DO UPDATE SET level=excluded.level`)
          .run(userId, guildId, level),
      top: (guildId, limit = 10) =>
        db.prepare('SELECT userId, guildId, xp, level FROM levels WHERE guildId=? ORDER BY xp DESC LIMIT ?').all(guildId, limit),
    },

    // ── Persist Roles ───────────────────
    persistRole: {
      get: (userId, guildId) => {
        const r = db.prepare('SELECT roleIds FROM persist_role WHERE userId=? AND guildId=?').get(userId, guildId);
        return r ? j(r.roleIds) : [];
      },
      set: (userId, guildId, roleIds) =>
        db.prepare(`INSERT INTO persist_role (userId, guildId, roleIds) VALUES (?,?,?)
          ON CONFLICT(userId, guildId) DO UPDATE SET roleIds=excluded.roleIds`)
          .run(userId, guildId, JSON.stringify(roleIds || [])),
      remove: (userId, guildId) =>
        db.prepare('DELETE FROM persist_role WHERE userId=? AND guildId=?').run(userId, guildId).changes > 0,
    },

    // ── Reaction Game Stats ─────────────
    reactionStat: {
      get: (userId, guildId) => {
        const r = db.prepare('SELECT wins FROM reaction_stat WHERE userId=? AND guildId=?').get(userId, guildId);
        return r || { wins: 0 };
      },
      inc: (userId, guildId) =>
        db.prepare(`INSERT INTO reaction_stat (userId, guildId, wins) VALUES (?,?,1)
          ON CONFLICT(userId, guildId) DO UPDATE SET wins=wins+1`)
          .run(userId, guildId),
      top: (guildId, limit = 10) =>
        db.prepare('SELECT userId, guildId, wins FROM reaction_stat WHERE guildId=? ORDER BY wins DESC LIMIT ?').all(guildId, limit),
    },

    // ── RPS Game Stats ──────────────────
    rpsStat: {
      get: (userId, guildId) => {
        const r = db.prepare('SELECT wins, losses, ties FROM rps_stat WHERE userId=? AND guildId=?').get(userId, guildId);
        return r || { wins: 0, losses: 0, ties: 0 };
      },
      inc: (userId, guildId, field) => {
        const ALLOWED = ['wins', 'losses', 'ties'];
        if (!ALLOWED.includes(field)) return;
        return db.prepare(`INSERT INTO rps_stat (userId, guildId, wins, losses, ties) VALUES (?,?,0,0,0)
          ON CONFLICT(userId, guildId) DO UPDATE SET ${field}=${field}+1`)
          .run(userId, guildId);
      },
      top: (guildId, limit = 10) =>
        db.prepare('SELECT userId, guildId, wins, losses, ties FROM rps_stat WHERE guildId=? ORDER BY wins DESC LIMIT ?').all(guildId, limit),
    },

    // ── Crypto Balances ─────────────────
    crypto: {
      get: (userId) =>
        db.prepare('SELECT userId, coin, amount FROM crypto_balance WHERE userId=?').all(userId),
      set: (userId, coin, amount) =>
        db.prepare(`INSERT INTO crypto_balance (userId, coin, amount) VALUES (?,?,?)
          ON CONFLICT(userId, coin) DO UPDATE SET amount=excluded.amount`)
          .run(userId, coin, amount),
    },

    // ── Reminders (legacy) ──────────────
    reminder: {
      add: (userId, channelId, at, message) => {
        const info = db.prepare('INSERT INTO reminder (userId, channelId, at, message) VALUES (?,?,?,?)').run(userId, channelId, at, message);
        return info.lastInsertRowid;
      },
      due: (now) =>
        db.prepare('SELECT * FROM reminder WHERE at<=?').all(now).map((r) => ({ ...r, _id: r.id })),
      remove: (id) =>
        db.prepare('DELETE FROM reminder WHERE id=?').run(id).changes > 0,
    },

    // ── User Reminders ──────────────────
    userReminder: {
      add: (userId, channelId, guildId, reason, createdAt, triggerAt) => {
        const info = db.prepare('INSERT INTO user_reminder (userId, channelId, guildId, reason, createdAt, triggerAt) VALUES (?,?,?,?,?,?)').run(userId, channelId, guildId, reason, createdAt, triggerAt);
        return info.lastInsertRowid;
      },
      due: (now) =>
        db.prepare('SELECT * FROM user_reminder WHERE triggerAt<=? AND fired=0').all(now).map((r) => ({ ...r, _id: r.id })),
      markFired: (id) =>
        db.prepare('UPDATE user_reminder SET fired=1 WHERE id=?').run(id),
      list: (userId) =>
        db.prepare('SELECT * FROM user_reminder WHERE userId=? AND fired=0 ORDER BY triggerAt ASC').all(userId),
      countSince: (userId, since) =>
        db.prepare('SELECT COUNT(*) as c FROM user_reminder WHERE userId=? AND createdAt>=?').get(userId, since).c,
      remove: (id) =>
        db.prepare('DELETE FROM user_reminder WHERE id=?').run(id).changes > 0,
    },

    // ── Timers ──────────────────────────
    timer: {
      add: (userId, channelId, guildId, reason, createdAt, triggerAt, messageId) => {
        const info = db.prepare('INSERT INTO timer (userId, channelId, guildId, reason, createdAt, triggerAt, messageId) VALUES (?,?,?,?,?,?,?)').run(userId, channelId, guildId, reason, createdAt, triggerAt, messageId);
        return info.lastInsertRowid;
      },
      due: (now) =>
        db.prepare('SELECT * FROM timer WHERE triggerAt<=? AND fired=0').all(now).map((r) => ({ ...r, _id: r.id })),
      markFired: (id) =>
        db.prepare('UPDATE timer SET fired=1 WHERE id=?').run(id),
    },

    // ── Scheduled Messages ──────────────
    scheduled: {
      add: (guildId, channelId, authorId, content, attachmentUrl, attachmentName, createdAt, triggerAt) => {
        const info = db.prepare('INSERT INTO scheduled_messages (guildId, channelId, authorId, content, attachmentUrl, attachmentName, createdAt, triggerAt) VALUES (?,?,?,?,?,?,?,?)').run(guildId, channelId, authorId, content, attachmentUrl, attachmentName, createdAt, triggerAt);
        return info.lastInsertRowid;
      },
      due: (now) =>
        db.prepare('SELECT * FROM scheduled_messages WHERE triggerAt<=? AND sent=0').all(now).map((r) => ({ ...r, _id: r.id })),
      markSent: (id) =>
        db.prepare('UPDATE scheduled_messages SET sent=1 WHERE id=?').run(id),
    },

    // ── Transcripts ────────────────────
    transcript: {
      add: (id, guildId, channelId, generatedBy, createdAt) =>
        db.prepare('INSERT OR IGNORE INTO transcripts (id, guildId, channelId, generatedBy, createdAt) VALUES (?,?,?,?,?)').run(id, guildId, channelId, generatedBy, createdAt),
      get: (id) => db.prepare('SELECT * FROM transcripts WHERE id=?').get(id) || null,
      delete: (id) => db.prepare('DELETE FROM transcripts WHERE id=?').run(id),
      expired: (cutoff) => db.prepare('SELECT id FROM transcripts WHERE createdAt<?').all(cutoff).map((r) => r.id),
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  MongoDB — complex / nested data (preferred when available)
// ─────────────────────────────────────────────────────────────
function makeMongo() {
  const mongoose = require('mongoose');
  const Schema = mongoose.Schema;

  const AntiNukeConfig = mongoose.models.AntiNukeConfig || mongoose.model('AntiNukeConfig', new Schema({
    guildId: String,
    enabled: { type: Boolean, default: false },
    logChannel: String,
    punishment: { type: String, default: 'ban' },
    owners: [String],
    whitelist: [String],
    wlRoles: [String],
  }));

  const GreetConfig = mongoose.models.GreetConfig || mongoose.model('GreetConfig', new Schema({
    guildId: String,
    enabled: { type: Boolean, default: false },
    channels: [String],
    message: String, title: String, description: String, footer: String,
    image: String, thumbnail: String,
    embed: { type: Boolean, default: false },
    ping: { type: Boolean, default: false },
    autoDelete: { type: Number, default: 0 },
  }));

  const GuildConfig = mongoose.models.GuildConfig || mongoose.model('GuildConfig', new Schema({
    guildId: String,
    logChannel: String, autoRoleId: String,
    welcomeChannel: String, welcomeMsg: String,
    leaveChannel: String, leaveMsg: String,
    badWords: [String],
    antiLink: { type: Boolean, default: false },
    antiSpam: { type: Boolean, default: false },
    adminRoles: [String],
    modRoles: [String],
    ownerRoles: [String],
    autoRoleBot: String,
    autoRoleHuman: String,
    modLimit: { type: Number, default: null },
    adminModLimit: { type: Number, default: null },
    modModLimit: { type: Number, default: null },
    prefix: { type: String, default: null },
  }));

  const Warn = mongoose.models.Warn || mongoose.model('Warn', new Schema({
    userId: String, guildId: String, moderatorId: String, reason: String, at: Number,
  }));

  const Level = mongoose.models.Level || mongoose.model('Level', new Schema({
    userId: String, guildId: String,
    xp: { type: Number, default: 0 }, level: { type: Number, default: 0 },
  }, { _id: false }));

  const PersistRole = mongoose.models.PersistRole || mongoose.model('PersistRole', new Schema({
    userId: String, guildId: String, roleIds: [String],
  }));

  const ReactionStat = mongoose.models.ReactionStat || mongoose.model('ReactionStat', new Schema({
    userId: String, guildId: String, wins: { type: Number, default: 0 },
  }));

  const RpsStat = mongoose.models.RpsStat || mongoose.model('RpsStat', new Schema({
    userId: String, guildId: String,
    wins: Number, losses: Number, ties: Number,
  }, { _id: false }));

  const CryptoBalance = mongoose.models.CryptoBalance || mongoose.model('CryptoBalance', new Schema({
    userId: String, coin: String, amount: Number,
  }));

  const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', new Schema({
    userId: String, channelId: String, at: Number, message: String,
  }));

  const UserReminder = mongoose.models.UserReminder || mongoose.model('UserReminder', new Schema({
    userId: String, channelId: String, guildId: String,
    reason: String, createdAt: Number, triggerAt: Number,
    fired: { type: Boolean, default: false },
  }));

  const Timer = mongoose.models.Timer || mongoose.model('Timer', new Schema({
    userId: String, channelId: String, guildId: String,
    reason: String, createdAt: Number, triggerAt: Number,
    messageId: String, fired: { type: Boolean, default: false },
  }));

  const ScheduledMessage = mongoose.models.ScheduledMessage || mongoose.model('ScheduledMessage', new Schema({
    guildId: String, channelId: String, authorId: String,
    content: String, attachmentUrl: String, attachmentName: String,
    createdAt: Number, triggerAt: Number,
    sent: { type: Boolean, default: false },
  }));

  const Transcript = mongoose.models.Transcript || mongoose.model('Transcript', new Schema({
    _id: String, guildId: String, channelId: String,
    generatedBy: String, createdAt: Number,
  }));

  const upsert = (Model, query, doc) =>
    Model.findOneAndUpdate(query, doc, { upsert: true, new: true });

  const clean = (data) => {
    if (!data || typeof data !== 'object') return {};
    const { _id: _i, __v: _v, guildId: _g, ...rest } = data;
    return rest;
  };

  return {
    antinuke: {
      get: async (guildId) => AntiNukeConfig.findOne({ guildId }).lean(),
      set: async (guildId, data) =>
        AntiNukeConfig.findOneAndUpdate({ guildId }, { $set: clean(data) }, { upsert: true, new: true }).lean(),
    },
    greet: {
      get: async (guildId) => GreetConfig.findOne({ guildId }).lean(),
      set: async (guildId, data) =>
        GreetConfig.findOneAndUpdate({ guildId }, { $set: clean(data) }, { upsert: true, new: true }).lean(),
    },
    guildConfig: {
      get: async (guildId) => GuildConfig.findOne({ guildId }).lean(),
      set: async (guildId, data) =>
        GuildConfig.findOneAndUpdate({ guildId }, { $set: clean(data) }, { upsert: true, new: true }).lean(),
    },
    warn: {
      add: async (userId, guildId, moderatorId, reason, at) =>
        (await Warn.create({ userId, guildId, moderatorId, reason, at }))._id,
      list: async (userId, guildId) =>
        Warn.find({ userId, guildId }).sort({ at: -1 }).lean(),
      clear: async (userId, guildId) =>
        (await Warn.deleteMany({ userId, guildId })).deletedCount,
      clearGuild: async (guildId) =>
        (await Warn.deleteMany({ guildId })).deletedCount,
    },
    level: {
      get: async (userId, guildId) => {
        const r = await Level.findOne({ userId, guildId }).lean();
        return r || { xp: 0, level: 0 };
      },
      addXp: async (userId, guildId, xp) => {
        const r = await Level.findOneAndUpdate({ userId, guildId }, { $inc: { xp } }, { upsert: true, new: true }).lean();
        return r || { xp: 0, level: 0 };
      },
      setLevel: async (userId, guildId, level) =>
        Level.findOneAndUpdate({ userId, guildId }, { $set: { level } }, { upsert: true, new: true }).lean(),
      top: async (guildId, limit = 10) =>
        Level.find({ guildId }).sort({ xp: -1 }).limit(limit).lean(),
    },
    persistRole: {
      get: async (userId, guildId) => {
        const r = await PersistRole.findOne({ userId, guildId }).lean();
        return r ? r.roleIds : [];
      },
      set: async (userId, guildId, roleIds) =>
        upsert(PersistRole, { userId, guildId }, { userId, guildId, roleIds }),
      remove: async (userId, guildId) =>
        (await PersistRole.deleteOne({ userId, guildId })).deletedCount > 0,
    },
    reactionStat: {
      get: async (userId, guildId) =>
        (await ReactionStat.findOne({ userId, guildId }).lean()) || { wins: 0 },
      inc: async (userId, guildId) =>
        ReactionStat.findOneAndUpdate({ userId, guildId }, { $inc: { wins: 1 } }, { upsert: true, new: true }),
      top: async (guildId, limit = 10) =>
        ReactionStat.find({ guildId }).sort({ wins: -1 }).limit(limit).lean(),
    },
    rpsStat: {
      get: async (userId, guildId) =>
        (await RpsStat.findOne({ userId, guildId }).lean()) || { wins: 0, losses: 0, ties: 0 },
      inc: async (userId, guildId, field) => {
        const ALLOWED = ['wins', 'losses', 'ties'];
        if (!ALLOWED.includes(field)) return null;
        return RpsStat.findOneAndUpdate({ userId, guildId }, { $inc: { [field]: 1 } }, { upsert: true, new: true }).lean();
      },
      top: async (guildId, limit = 10) =>
        RpsStat.find({ guildId }).sort({ wins: -1 }).limit(limit).lean(),
    },
    crypto: {
      get: async (userId) => CryptoBalance.find({ userId }).lean(),
      set: async (userId, coin, amount) =>
        upsert(CryptoBalance, { userId, coin }, { userId, coin, amount }),
    },
    reminder: {
      add: async (userId, channelId, at, message) =>
        (await Reminder.create({ userId, channelId, at, message }))._id,
      due: async (now) => Reminder.find({ at: { $lte: now } }).lean(),
      remove: async (id) => (await Reminder.deleteOne({ _id: id })).deletedCount > 0,
    },
    userReminder: {
      add: async (userId, channelId, guildId, reason, createdAt, triggerAt) =>
        (await UserReminder.create({ userId, channelId, guildId, reason, createdAt, triggerAt }))._id,
      due: async (now) => UserReminder.find({ triggerAt: { $lte: now }, fired: false }).lean(),
      markFired: async (id) => UserReminder.updateOne({ _id: id }, { $set: { fired: true } }),
      list: async (userId) => UserReminder.find({ userId, fired: false }).sort({ triggerAt: 1 }).lean(),
      countSince: async (userId, since) =>
        UserReminder.countDocuments({ userId, createdAt: { $gte: since } }),
      remove: async (id) => (await UserReminder.deleteOne({ _id: id })).deletedCount > 0,
    },
    timer: {
      add: async (userId, channelId, guildId, reason, createdAt, triggerAt, messageId) =>
        (await Timer.create({ userId, channelId, guildId, reason, createdAt, triggerAt, messageId }))._id,
      due: async (now) => Timer.find({ triggerAt: { $lte: now }, fired: false }).lean(),
      markFired: async (id) => Timer.updateOne({ _id: id }, { $set: { fired: true } }),
    },
    scheduled: {
      add: async (guildId, channelId, authorId, content, attachmentUrl, attachmentName, createdAt, triggerAt) =>
        (await ScheduledMessage.create({ guildId, channelId, authorId, content, attachmentUrl, attachmentName, createdAt, triggerAt }))._id,
      due: async (now) => ScheduledMessage.find({ triggerAt: { $lte: now }, sent: false }).lean(),
      markSent: async (id) => ScheduledMessage.updateOne({ _id: id }, { $set: { sent: true } }),
    },
    transcript: {
      add: async (id, guildId, channelId, generatedBy, createdAt) => {
        try { await Transcript.create({ _id: id, guildId, channelId, generatedBy, createdAt }); } catch { /* duplicate */ }
      },
      get: async (id) => Transcript.findById(id).lean(),
      delete: async (id) => Transcript.deleteOne({ _id: id }),
      expired: async (cutoff) => Transcript.find({ createdAt: { $lt: cutoff } }).select('_id').lean().then((r) => r.map((x) => String(x._id))),
    },
  };
}

// ─────────────────────────────────────────────────────────────
//  Init & unified getDb()
// ─────────────────────────────────────────────────────────────
const ALL_NS = [
  'antinuke', 'greet', 'guildConfig', 'warn', 'level',
  'persistRole', 'reactionStat', 'rpsStat', 'crypto',
  'reminder', 'userReminder', 'timer', 'scheduled', 'transcript',
];

async function init() {
  // Always init SQLite — handles ALL data
  sql = makeSqlite();
  logger.success(`SQLite ready (full fallback) → ${config.sqlitePath || './data/bot.db'}`);

  // Try MongoDB (optional — preferred for complex data)
  const mongoUri = config.mongoUri;
  if (mongoUri) {
    try {
      const mongoose = require('mongoose');
      await mongoose.connect(mongoUri);
      mongo = makeMongo();
      logger.success(`MongoDB connected → ${mongoUri}`);
    } catch (e) {
      logger.warn('MongoDB connection failed — using SQLite for all data (zero features disabled)', e.message);
      mongo = null;
    }
  } else {
    logger.info('MongoDB not configured — running on SQLite only (all commands work).');
  }

  // Build unified interface
  unified = {
    backend: mongo ? 'hybrid' : 'sqlite',
    isMongoConnected: () => !!mongo,
    healthCheck: async () => {
      try {
        if (rawSqliteDb) {
          rawSqliteDb.prepare('SELECT 1').get();
        }
        return {
          status: 'healthy',
          backend: mongo ? 'hybrid' : 'sqlite',
          sqlite: true,
          mongo: !!mongo,
        };
      } catch (err) {
        return {
          status: 'unhealthy',
          error: err.message,
          backend: mongo ? 'hybrid' : 'sqlite',
        };
      }
    },
    close: async () => {
      try {
        if (rawSqliteDb && typeof rawSqliteDb.close === 'function') {
          rawSqliteDb.close();
          rawSqliteDb = null;
        }
      } catch (e) {
        logger.debug('Error closing SQLite:', e.message);
      }
      try {
        if (mongo) {
          const mongoose = require('mongoose');
          await mongoose.disconnect();
          mongo = null;
        }
      } catch (e) {
        logger.debug('Error disconnecting Mongoose:', e.message);
      }
      unified = null;
      sql = null;
    },
  };

  // Original 5 namespaces — always from SQLite
  for (const ns of ['upi', 'afk', 'tag', 'cmdWhitelist', 'ignored']) {
    unified[ns] = sql[ns];
  }

  // Complex namespaces — MongoDB if available, otherwise SQLite fallback
  for (const ns of ALL_NS) {
    if (mongo) {
      unified[ns] = mongo[ns];
    } else {
      unified[ns] = sql[ns];
    }
  }

  return unified;
}

function getDb() {
  if (!unified) throw new Error('DB not initialised — call init() first');
  return unified;
}

module.exports = { init, getDb };
