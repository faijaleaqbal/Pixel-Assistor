// src/events/messageCreate.js
// Core dispatcher for prefix commands, auto-moderation, XP, and AFK tracking.

const { EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const { resolve } = require('../handlers/commandHandler');
const { executePrefixCommand } = require('../handlers/commandPipeline');
const { hasPermission } = require('../utils/perms');
const { getDb } = require('../utils/db');
const { getPrefix } = require('../utils/prefixCache');

// In-memory stores for XP cooldown and spam tracking
const xpCooldownMap = new Map();
const spamMap = new Map();

// Periodic cleanup every 5 minutes to prevent memory leaks
const memoryCleanupInterval = setInterval(() => {
  const now = Date.now();
  const spamCutoff = now - 5000;
  for (const [key, timestamps] of spamMap.entries()) {
    if (!timestamps.length || timestamps[timestamps.length - 1] < spamCutoff) {
      spamMap.delete(key);
    }
  }
  for (const [key, expiresAt] of xpCooldownMap.entries()) {
    if (expiresAt < now) {
      xpCooldownMap.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (typeof memoryCleanupInterval.unref === 'function') memoryCleanupInterval.unref();

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message || message.author?.bot || !message.guild) return;

    // ── 1. AFK auto-clear ──
    try {
      const db = getDb();
      const afk = await db.afk.get(message.author.id, message.guild.id);
      if (afk) {
        await db.afk.remove(message.author.id, message.guild.id);
        try {
          const nick = message.member?.nickname;
          if (nick) {
            await message.member.setNickname(nick.replace(/^\[AFK\]\s*/, '')).catch(() => {});
          }
        } catch { /* ignore nickname perm error */ }

        try {
          const m = await message.reply({
            embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('Welcome back — your AFK status was cleared.')],
          });
          setTimeout(() => m.delete().catch(() => {}), 5000);
        } catch { /* channel perms */ }
      }
    } catch { /* db not ready */ }

    // ── 2. AFK mention notice ──
    if (message.mentions?.users?.size) {
      try {
        const db = getDb();
        for (const [, u] of message.mentions.users) {
          if (u.bot || u.id === message.author.id) continue;
          const afk = await db.afk.get(u.id, message.guild.id);
          if (!afk) continue;

          const dmBool = typeof afk.dmOnMention === 'number'
            ? afk.dmOnMention === 1
            : !!afk.dmOnMention;

          const plainName = u.username || u.tag || u.id;
          const sinceMs = Date.now() - (afk.since || Date.now());
          const sinceStr = humanizeAgo(sinceMs);

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
            } catch {
              await message.channel.send({
                content: `💤 ${plainName} is AFK: **${afk.reason || 'AFK'}** (since ${sinceStr}) — *I tried to DM them but their DMs are closed.*`,
                allowedMentions: { parse: [] },
              }).catch(() => {});
            }
          } else {
            await message.reply({
              content: `💤 ${plainName} is AFK: **${afk.reason || 'AFK'}** (since ${sinceStr})`,
              allowedMentions: { parse: [] },
            }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    }

    // ── 3. Auto-moderation + XP ──
    try {
      const db = getDb();
      const gCfg = await db.guildConfig.get(message.guild.id);

      if (gCfg) {
        // Bad word filter
        if (gCfg.badWords && gCfg.badWords.length) {
          const lower = message.content.toLowerCase();
          const found = gCfg.badWords.find((w) => lower.includes(w.toLowerCase()));
          if (found && !hasPermission(message.member, 'Administrator')) {
            await message.delete().catch(() => {});
            return message.author.send({
              embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Auto-Mod: Bad Word').setDescription('Your message was deleted for containing a filtered word.')],
            }).catch(() => {});
          }
        }

        // Anti-link
        if (gCfg.antiLink && !hasPermission(message.member, 'Administrator')) {
          const linkRe = new RegExp('https?://|www\\.|[a-z0-9-]+\\.(?:com|net|org|io|gg|me|dev|xyz|co|in|ru|de|fr|tv|info|biz|app|edu|gov)(?:/|$)|discord\\.(?:gg|com/invite)/', 'i');
          if (linkRe.test(message.content)) {
            await message.delete().catch(() => {});
            return message.author.send({
              embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Auto-Mod: Link Detected').setDescription('Links are not allowed in this server.')],
            }).catch(() => {});
          }
        }

        // Anti-spam (5+ messages in 3s)
        if (gCfg.antiSpam && !hasPermission(message.member, 'Administrator')) {
          const spamKey = `${message.author.id}:${message.guild.id}`;
          const now = Date.now();
          if (!spamMap.has(spamKey)) spamMap.set(spamKey, []);
          const msgs = spamMap.get(spamKey);
          msgs.push(now);
          while (msgs.length && msgs[0] < now - 3000) msgs.shift();
          if (msgs.length >= 5) {
            try {
              await message.member.timeout(10000, 'Auto-mod: spam detected');
              msgs.length = 0;
            } catch { /* ignore timeout perm error */ }
          }
        }
      }

      // XP gain
      const xpKey = `${message.author.id}:${message.guild.id}`;
      const now = Date.now();
      const expiresAt = xpCooldownMap.get(xpKey);
      if (!expiresAt || expiresAt < now) {
        xpCooldownMap.set(xpKey, now + 60000);
        const xpGain = 15 + Math.floor(Math.random() * 11);
        const result = await db.level.addXp(message.author.id, message.guild.id, xpGain);
        const currentXp = result?.xp || xpGain;
        const currentLevel = result?.level || 0;
        const needed = (currentLevel + 1) * 100;
        if (currentXp >= needed) {
          await db.level.setLevel(message.author.id, message.guild.id, currentLevel + 1);
          try {
            await message.reply({
              embeds: [new EmbedBuilder().setColor(0xFFD700).setDescription(`🏆 ${message.author} leveled up to **Level ${currentLevel + 1}**!`)],
            });
          } catch { /* channel perms */ }
        }
      }
    } catch { /* auto-mod or db error */ }

    // ── 4. Prefix & Command Dispatch ──
    const guildPrefix = await getPrefix(message.guild.id);
    const botMention1 = `<@${client.user.id}>`;
    const botMention2 = `<@!${client.user.id}>`;

    // Mention-only ping response
    if (message.content.trim() === botMention1 || message.content.trim() === botMention2) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(`👋 Hey! My prefix in this server is \`${guildPrefix}\`.\nUse \`${guildPrefix}help\` to browse all available commands.`)],
      }).catch(() => {});
    }

    let prefixUsed = null;
    if (message.content.startsWith(guildPrefix)) {
      prefixUsed = guildPrefix;
    } else if (message.content.startsWith(botMention1)) {
      prefixUsed = botMention1;
    } else if (message.content.startsWith(botMention2)) {
      prefixUsed = botMention2;
    }

    let isWlUser = false;
    if (!prefixUsed) {
      try {
        const db = getDb();
        isWlUser = await db.cmdWhitelist.isWhitelisted(message.author.id, message.guild.id);
      } catch { /* db not ready */ }
    }

    if (!prefixUsed && !isWlUser) return;

    const args = prefixUsed
      ? message.content.slice(prefixUsed.length).trim().split(/\s+/)
      : message.content.trim().split(/\s+/);
    const name = args.shift()?.toLowerCase();
    if (!name) return;

    const cmd = resolve(name);
    if (!cmd) return;

    // Dispatch through the verified pipeline
    await executePrefixCommand(cmd, message, args, client, guildPrefix);
  },
};

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
