// src/commands/admin/greet.js
// Welcome message configuration with embed support.
// Requires ManageChannels permission.
// Usage:
//   ?greet setup <#channel>
//   ?greet test
//   ?greet enable | disable | reset | config
//   ?greet channel add|remove|show <#channel>
//   ?greet message <text>
//   ?greet title <text>
//   ?greet thumbnail <url>
//   ?greet image <url>
//   ?greet footer <text>
//   ?greet embed on|off
//   ?greet ping on|off
//   ?greet autodel <seconds>

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');

const E = (c, d) => new EmbedBuilder().setColor(c).setDescription(d);
const RED = 0xED4245, GREEN = 0x57F287, BLUE = 0x5865F2, YELLOW = 0xFEE75C;

const DEFAULT_MSG = 'Welcome to {server}, {user}! You are member **#{count}**.';

function buildWelcomeEmbed(member, cfg, text) {
  const embed = new EmbedBuilder().setColor(0x57F287);
  if (cfg.title) embed.setTitle(cfg.title);
  if (text) embed.setDescription(text);
  if (cfg.thumbnail) embed.setThumbnail(cfg.thumbnail);
  if (cfg.image) embed.setImage(cfg.image);
  if (cfg.footer) embed.setFooter({ text: cfg.footer });
  embed.setTimestamp();
  return embed;
}

module.exports = {
  name: 'greet',
  category: 'admin',
  description: 'Configure welcome messages for new members.',
  usage: '<setup|test|enable|disable|reset|config|channel|message|title|thumbnail|image|footer|embed|ping|autodel> [args]',
  cooldown: 3,
  permissions: ['ManageChannels'],

  async execute(message, args) {
    const db = getDb();
    const gid = message.guild.id;
    let cfg = (await db.greet.get(gid)) || { enabled: false, channels: [], message: DEFAULT_MSG, title: '', description: '', footer: '', image: '', thumbnail: '', embed: true, ping: true, autoDelete: 0 };

    if (!args.length) return message.reply({ embeds: [E(YELLOW, 'Provide a sub-command. See `?help greet`.')] });

    const sub = args[0].toLowerCase();

    // ── Setup ──
    if (sub === 'setup') {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply({ embeds: [E(RED, 'Mention a channel to set as the welcome channel.')] });
      cfg.enabled = true;
      cfg.channels = [ch.id];
      cfg.message = cfg.message || DEFAULT_MSG;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, `✅ Greet **enabled**. Welcome channel set to ${ch}. Default message applied.`)] });
    }

    // ── Test ──
    if (sub === 'test') {
      const text = (cfg.message || DEFAULT_MSG)
        .replace(/{user}/g, message.author.toString())
        .replace(/{mention}/g, message.author.toString())
        .replace(/{server}/g, message.guild.name)
        .replace(/{count}/g, String(message.guild.memberCount));
      if (cfg.embed) {
        const embed = buildWelcomeEmbed(message.member, cfg, text);
        const payload = cfg.ping ? { content: message.author.toString(), embeds: [embed] } : { embeds: [embed] };
        return message.reply(payload);
      }
      const payload = cfg.ping ? { content: `${message.author.toString()}\n${text}` } : { content: text };
      return message.reply(payload);
    }

    // ── Enable ──
    if (sub === 'enable') {
      cfg.enabled = true;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ Greet is now **enabled**.')] });
    }

    // ── Disable ──
    if (sub === 'disable') {
      cfg.enabled = false;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ Greet is now **disabled**.')] });
    }

    // ── Reset ──
    if (sub === 'reset') {
      cfg = { enabled: false, channels: [], message: DEFAULT_MSG, title: '', description: '', footer: '', image: '', thumbnail: '', embed: true, ping: true, autoDelete: 0 };
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ All greet configuration has been reset.')] });
    }

    // ── Config ──
    if (sub === 'config') {
      const chList = cfg.channels.length ? cfg.channels.map(id => `<#${id}>`).join(', ') : '`None`';
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Greet Configuration')
        .addFields(
          { name: 'Enabled', value: cfg.enabled ? '✅ Yes' : '❌ No', inline: true },
          { name: 'Channels', value: chList, inline: true },
          { name: 'Embed', value: cfg.embed ? '✅ On' : '❌ Off', inline: true },
          { name: 'Ping User', value: cfg.ping ? '✅ On' : '❌ Off', inline: true },
          { name: 'Auto-Delete', value: cfg.autoDelete ? `**${cfg.autoDelete}s**` : '❌ Off', inline: true },
          { name: 'Message', value: cfg.message ? `\`${cfg.message}\`` : '`None`', inline: false },
          { name: 'Title', value: cfg.title ? `\`${cfg.title}\`` : '`None`', inline: false },
          { name: 'Footer', value: cfg.footer ? `\`${cfg.footer}\`` : '`None`', inline: false },
          { name: 'Thumbnail', value: cfg.thumbnail ? '[Link](' + cfg.thumbnail + ')' : '`None`', inline: false },
          { name: 'Image', value: cfg.image ? '[Link](' + cfg.image + ')' : '`None`', inline: false },
        ).setTimestamp()] });
    }

    // ── Channel sub-commands ──
    if (sub === 'channel') {
      const action = args[1]?.toLowerCase();
      if (action === 'add') {
        const ch = message.mentions.channels.first();
        if (!ch) return message.reply({ embeds: [E(RED, 'Mention a channel to add.')] });
        if (cfg.channels.includes(ch.id)) return message.reply({ embeds: [E(YELLOW, `${ch} is already a welcome channel.`)] });
        cfg.channels.push(ch.id);
        await db.greet.set(gid, cfg);
        return message.reply({ embeds: [E(GREEN, `✅ ${ch} added to welcome channels.`)] });
      }
      if (action === 'remove') {
        const ch = message.mentions.channels.first();
        if (!ch) return message.reply({ embeds: [E(RED, 'Mention a channel to remove.')] });
        cfg.channels = cfg.channels.filter(id => id !== ch.id);
        await db.greet.set(gid, cfg);
        return message.reply({ embeds: [E(GREEN, `✅ ${ch} removed from welcome channels.`)] });
      }
      if (action === 'show') {
        if (!cfg.channels.length) return message.reply({ embeds: [E(BLUE, 'No welcome channels set.')] });
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Welcome Channels').setDescription(cfg.channels.map(id => `- <#${id}>`).join('\n'))] });
      }
      return message.reply({ embeds: [E(RED, 'Channel sub-commands: `add`, `remove`, `show`.')] });
    }

    // ── Message ──
    if (sub === 'message') {
      const text = args.slice(1).join(' ');
      if (!text) return message.reply({ embeds: [E(RED, 'Provide the welcome message text. Variables: `{user}`, `{server}`, `{count}`, `{mention}`.')] });
      cfg.message = text;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ Welcome message updated.')] });
    }

    // ── Title ──
    if (sub === 'title') {
      const text = args.slice(1).join(' ');
      if (!text) return message.reply({ embeds: [E(RED, 'Provide the embed title text.')] });
      cfg.title = text;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ Embed title updated.')] });
    }

    // ── Thumbnail ──
    if (sub === 'thumbnail') {
      const url = args.slice(1).join(' ');
      if (!url) return message.reply({ embeds: [E(RED, 'Provide an image URL for the thumbnail.')] });
      cfg.thumbnail = url;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ Embed thumbnail updated.')] });
    }

    // ── Image ──
    if (sub === 'image') {
      const url = args.slice(1).join(' ');
      if (!url) return message.reply({ embeds: [E(RED, 'Provide an image URL for the embed image.')] });
      cfg.image = url;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ Embed image updated.')] });
    }

    // ── Footer ──
    if (sub === 'footer') {
      const text = args.slice(1).join(' ');
      if (!text) return message.reply({ embeds: [E(RED, 'Provide the embed footer text.')] });
      cfg.footer = text;
      await db.greet.set(gid, cfg);
      return message.reply({ embeds: [E(GREEN, '✅ Embed footer updated.')] });
    }

    // ── Embed toggle ──
    if (sub === 'embed') {
      const val = args[1]?.toLowerCase();
      if (val === 'on') {
        cfg.embed = true;
        await db.greet.set(gid, cfg);
        return message.reply({ embeds: [E(GREEN, '✅ Embed mode **enabled**.')] });
      }
      if (val === 'off') {
        cfg.embed = false;
        await db.greet.set(gid, cfg);
        return message.reply({ embeds: [E(GREEN, '✅ Embed mode **disabled**.')] });
      }
      return message.reply({ embeds: [E(RED, 'Specify `on` or `off`.')] });
    }

    // ── Ping toggle ──
    if (sub === 'ping') {
      const val = args[1]?.toLowerCase();
      if (val === 'on') {
        cfg.ping = true;
        await db.greet.set(gid, cfg);
        return message.reply({ embeds: [E(GREEN, '✅ User ping **enabled**.')] });
      }
      if (val === 'off') {
        cfg.ping = false;
        await db.greet.set(gid, cfg);
        return message.reply({ embeds: [E(GREEN, '✅ User ping **disabled**.')] });
      }
      return message.reply({ embeds: [E(RED, 'Specify `on` or `off`.')] });
    }

    // ── Auto-Delete ──
    if (sub === 'autodel') {
      const seconds = parseInt(args[1]);
      if (isNaN(seconds) || seconds < 0) return message.reply({ embeds: [E(RED, 'Provide a valid number of seconds (0 = off).')] });
      cfg.autoDelete = seconds;
      await db.greet.set(gid, cfg);
      if (seconds === 0) return message.reply({ embeds: [E(GREEN, '✅ Auto-delete **disabled**.')] });
      return message.reply({ embeds: [E(GREEN, `✅ Welcome messages will auto-delete after **${seconds}s**.`)] });
    }

    return message.reply({ embeds: [E(RED, 'Unknown sub-command. See `?help greet`.')] });
  },
};
