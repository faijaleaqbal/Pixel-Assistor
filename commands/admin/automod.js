// src/commands/admin/automod.js
// Configure auto-moderation: bad words, anti-link, anti-spam.
// Usage:
//   ?automod badwords add <word1,word2,...>
//   ?automod badwords remove <word1,word2,...>
//   ?automod badwords list
//   ?automod badwords clear
//   ?automod antilink on|off
//   ?automod antispam on|off

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'automod',
  aliases: ['am'],
  category: 'admin',
  description: 'Configure auto-moderation (bad words, anti-link, anti-spam).',
  usage: '<badwords|antilink|antispam> <sub-command>',
  cooldown: 3,
  permissions: ['Administrator'],
  // args: true removed — let execute() handle the no-args case so `?automod`
  // prints a helpful sub-command list instead of being rejected by the handler.

  async execute(message, args) {
    const sub = args[0]?.toLowerCase();
    if (!sub) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a sub-command: `badwords`, `antilink`, or `antispam`.')] });

    const db = getDb();
    const gCfg = (await db.guildConfig.get(message.guild.id)) || {};

    // ── Bad Words ──
    if (sub === 'badwords') {
      const action = args[1]?.toLowerCase();
      const current = gCfg.badWords || [];

      if (action === 'add') {
        const raw = args.slice(2).join(' ');
        const words = raw.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
        if (!words.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide words separated by commas.')] });
        const added = [];
        for (const w of words) {
          if (!current.includes(w)) { current.push(w); added.push(w); }
        }
        await db.guildConfig.set(message.guild.id, { badWords: current });
        if (!added.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('All words are already in the filter.')] });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Added **${added.length}** word(s) to the filter:\n\`${added.join('`, `')}\``)] });
      }

      if (action === 'remove') {
        const raw = args.slice(2).join(' ');
        const words = raw.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
        if (!words.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide words to remove.')] });
        const removed = [];
        for (const w of words) {
          const idx = current.indexOf(w);
          if (idx !== -1) { current.splice(idx, 1); removed.push(w); }
        }
        await db.guildConfig.set(message.guild.id, { badWords: current });
        if (!removed.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('None of those words were in the filter.')] });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed **${removed.length}** word(s) from the filter:\n\`${removed.join('`, `')}\``)] });
      }

      if (action === 'list') {
        if (!current.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('No bad words are currently filtered.')] });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Filtered Words').setDescription(current.map((w, i) => `\`${i + 1}. ${w}\``).join('\n')).setFooter({ text: `Total: ${current.length}` })] });
      }

      if (action === 'clear') {
        await db.guildConfig.set(message.guild.id, { badWords: [] });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ All filtered words have been cleared.')] });
      }

      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Bad words sub-commands: `add`, `remove`, `list`, `clear`.')] });
    }

    // ── Anti-Link ──
    if (sub === 'antilink') {
      const val = args[1]?.toLowerCase();
      if (val === 'on') {
        await db.guildConfig.set(message.guild.id, { antiLink: true });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ **Anti-link** is now **enabled**. Links sent by non-admins will be auto-deleted.')] });
      }
      if (val === 'off') {
        await db.guildConfig.set(message.guild.id, { antiLink: false });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ **Anti-link** is now **disabled**.')] });
      }
      const status = gCfg.antiLink ? '**ON** ✅' : '**OFF** ❌';
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Anti-Link Status').setDescription(`Current status: ${status}`)] });
    }

    // ── Anti-Spam ──
    if (sub === 'antispam') {
      const val = args[1]?.toLowerCase();
      if (val === 'on') {
        await db.guildConfig.set(message.guild.id, { antiSpam: true });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ **Anti-spam** is now **enabled**. Users sending 5+ messages in 3s will be auto-timeout (10s).')] });
      }
      if (val === 'off') {
        await db.guildConfig.set(message.guild.id, { antiSpam: false });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ **Anti-spam** is now **disabled**.')] });
      }
      const status = gCfg.antiSpam ? '**ON** ✅' : '**OFF** ❌';
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Anti-Spam Status').setDescription(`Current status: ${status}`)] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Unknown sub-command. Use `badwords`, `antilink`, or `antispam`.')] });
  },
};
