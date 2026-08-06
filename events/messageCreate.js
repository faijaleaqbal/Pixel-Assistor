// src/events/messageCreate.js
// Core dispatcher for prefix commands. Parses args, resolves the command (incl. aliases),
// enforces cooldowns + perms + ownerOnly, wraps execute() in try/catch.
// Also handles AFK auto-reply + auto-clear.

const config = require('../utils/config');
const logger = require('../utils/logger');
const { resolve } = require('../handlers/commandHandler');
const { EmbedBuilder } = require('discord.js');
const cooldowns = require('../utils/cooldowns');
const { hasPermission, isOwner } = require('../utils/perms');
const { getDb } = require('../utils/db');

// In-memory stores for XP cooldown and spam tracking
const xpCooldowns = new Set();
const spamMap = new Map();

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    // AFK auto-clear: if the author is AFK and they send any message, clear it.
    try {
      const db = getDb();
      const afk = await db.afk.get(message.author.id, message.guild.id);
      if (afk) {
        await db.afk.remove(message.author.id, message.guild.id);
        try { const nick = message.member?.nickname; if (nick) await message.member.setNickname(nick.replace(/^\[AFK\]\s*/, '')).catch(() => {}); } catch {}
        try {
          const m = await message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('Welcome back — your AFK status was cleared.')] });
          setTimeout(() => m.delete().catch(() => {}), 5000);
        } catch { /* channel perms */ }
      }
    } catch { /* db not ready */ }

    // AFK auto-reply: if this message mentions an AFK user, reply with their reason.
    // Bug 2 fix: when dmOnMention is Yes for the AFK user, send ONLY the DM (with reason
    // + jump link) — do NOT re-mention them in the channel, which would cause a second
    // native Discord notification. The channel reply (if any) must use plain text
    // display name/username, never a real `<@id>` mention.
    if (message.mentions.users.size) {
      try {
        const db = getDb();
        for (const [, u] of message.mentions.users) {
          if (u.bot) continue;
          const afk = await db.afk.get(u.id, message.guild.id);
          if (!afk) continue;

          const dmBool = typeof afk.dmOnMention === 'number'
            ? afk.dmOnMention === 1
            : !!afk.dmOnMention;

          // Plain-text display name — NEVER use a real <@id> mention here, otherwise
          // Discord's notification system fires a second ping for the AFK user.
          const plainName = u.username || u.tag || u.id;

          // Compute a human-friendly "since" string.
          const sinceMs = Date.now() - (afk.since || Date.now());
          const sinceStr = humanizeAgo(sinceMs);

          // 1) Always DM the AFK user when they opted in.
          if (dmBool) {
            const jumpLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const dmEmbed = new EmbedBuilder()
              .setColor(0xFEE75C)
              .setTitle('💤 You were mentioned while AFK')
              .setDescription(
                `**${message.author.tag}** mentioned you in **${message.guild.name}**:` +
                `\n> ${message.content.slice(0, 300)}${message.content.length > 300 ? '...' : ''}` +
                `\n\n**Your AFK reason:** ${afk.reason || 'AFK'}` +
                `\n[Jump to message](${jumpLink})`
              )
              .setTimestamp();
            try {
              await u.send({ embeds: [dmEmbed] });
            } catch (dmErr) {
              // DMs closed — fall back to a non-pinging channel notice so the
              // mentioner knows the AFK user is away but won't actually be notified.
              await message.channel.send({
                content: `💤 ${plainName} is AFK: **${afk.reason || 'AFK'}** (since ${sinceStr}) — *I tried to DM them but their DMs are closed.*`,
                allowedMentions: { parse: [] },
              }).catch(() => {});
            }
          } else {
            // 2) dmOnMention is No — channel-only reply, plain text (no real mention).
            await message.reply({
              content: `💤 ${plainName} is AFK: **${afk.reason || 'AFK'}** (since ${sinceStr})`,
              allowedMentions: { parse: [] },
            }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    }

    // ── Auto-moderation + XP (before command check) ──
    try {
      const db = getDb();
      const gCfg = await db.guildConfig.get(message.guild.id);

      if (gCfg) {
        // Bad word filter
        if (gCfg.badWords && gCfg.badWords.length) {
          const lower = message.content.toLowerCase();
          const found = gCfg.badWords.find(w => lower.includes(w.toLowerCase()));
          if (found) {
            await message.delete().catch(() => {});
            return message.author.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Auto-Mod: Bad Word').setDescription(`Your message was deleted for containing a filtered word.`)] }).catch(() => {});
          }
        }

        // Anti-link (catches http(s)://, www., bare domains, Discord invites, t.me, etc.)
        if (gCfg.antiLink && !hasPermission(message.member, 'Administrator')) {
          const linkRe = new RegExp('https?://|www\\.|[a-z0-9-]+\\.(?:com|net|org|io|gg|me|dev|xyz|co|in|ru|de|fr|tv|info|biz|app|edu|gov)(?:/|$)|discord\\.(?:gg|com/invite)/', 'i');
          if (linkRe.test(message.content)) {
            await message.delete().catch(() => {});
            return message.author.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Auto-Mod: Link Detected').setDescription('Links are not allowed in this server.')] }).catch(() => {});
          }
        }

        // Anti-spam (5+ messages in 3s) — scoped per guild+user to avoid cross-guild false positives
        if (gCfg.antiSpam) {
          const spamKey = `${message.author.id}:${message.guild.id}`;
          const now = Date.now();
          if (!spamMap.has(spamKey)) spamMap.set(spamKey, []);
          const msgs = spamMap.get(spamKey);
          msgs.push(now);
          // Keep only last 3 seconds
          while (msgs.length && msgs[0] < now - 3000) msgs.shift();
          if (msgs.length >= 5) {
            try {
              await message.member.timeout(10000, 'Auto-mod: spam detected');
              msgs.length = 0; // reset so subsequent messages don't re-trigger another timeout
            } catch {}
          }
        }
      }

      // XP gain (15-25 XP per message, cooldown 60s per user+guild) — awarded AFTER
      // auto-mod so users don't gain XP for rule-violating messages that get deleted.
      const xpKey = `${message.author.id}:${message.guild.id}`;
      if (!xpCooldowns.has(xpKey)) {
        const xpGain = 15 + Math.floor(Math.random() * 11);
        const result = await db.level.addXp(message.author.id, message.guild.id, xpGain);
        const currentXp = result.xp || xpGain;
        const currentLevel = result.level || 1;
        const needed = currentLevel * 100;
        if (currentXp >= needed) {
          await db.level.setLevel(message.author.id, message.guild.id, currentLevel + 1);
          try { await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setDescription(`🏆 ${message.author} leveled up to **Level ${currentLevel + 1}**!`)] }); } catch {}
        }
        xpCooldowns.add(xpKey);
        setTimeout(() => xpCooldowns.delete(xpKey), 60000);
      }
    } catch { /* auto-mod error — never crash the handler */ }

    // ── Command whitelist: let whitelisted users use commands without prefix ──
    let isWlUser = false;
    const hasPrefix = message.content.startsWith(config.prefix);

    if (!hasPrefix) {
      try {
        const db = getDb();
        isWlUser = await db.cmdWhitelist.isWhitelisted(message.author.id, message.guild.id);
      } catch { /* db not ready */ }
    }

    if (!hasPrefix && !isWlUser) return;

    const args = hasPrefix
      ? message.content.slice(config.prefix.length).trim().split(/\s+/)
      : message.content.trim().split(/\s+/);
    const name = args.shift()?.toLowerCase();
    if (!name) return;

    const cmd = resolve(name);
    if (!cmd) return;

    // Owner-only?
    if (cmd.ownerOnly && !isOwner(message.author.id)) {
      return replyError(message, 'This command is restricted to the bot owner.');
    }

    // Permissions check
    if (cmd.permissions && cmd.permissions.length) {
      const missing = cmd.permissions.filter((p) => !hasPermission(message.member, p));
      if (missing.length) {
        return replyError(message, `You need these permissions: \`${missing.join(', ')}\``);
      }
    }

    // Cooldown
    const cd = cooldowns.check(cmd.name, message.author.id, cmd.cooldown);
    if (cd > 0) {
      return replyError(message, `Slow down — try again in **${cd}s**.`, 'Cooldown');
    }

    // Required args?
    if (cmd.args && !args.length) {
      return replyError(message, `Missing arguments.\nUsage: \`${config.prefix}${cmd.name}${cmd.usage ? ' ' + cmd.usage : ''}\``);
    }

    try {
      await cmd.execute(message, args, client);
    } catch (e) {
      logger.error(`command error [${cmd.name}]`, e?.stack || e?.message || e);
      replyError(message, `Something went wrong running \`${cmd.name}\`.\n\`\`\`${(e?.message || String(e)).slice(0, 1500)}\`\`\``);
    }
  },
};

async function replyError(message, text, title = 'Error') {
  const embed = new EmbedBuilder().setColor(0xED4245).setTitle(title).setDescription(text).setTimestamp();
  try { await message.reply({ embeds: [embed] }); } catch { /* channel perms */ }
}

// Human-friendly "X seconds ago" / "X minutes ago" string used by the AFK mention reply.
// Matches the spec example: "AhaN is AFK: ho (since 23 seconds ago)".
function humanizeAgo(ms) {
  if (!ms || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
