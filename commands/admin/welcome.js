// src/commands/admin/welcome.js
// Configure welcome messages for new members.
// Usage:
//   ?welcome set <#channel>
//   ?welcome message <text>   (use {user}, {server}, {count} as variables)
//   ?welcome preview
//   ?welcome disable
//   ?welcome

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'welcome',
  category: 'admin',
  description: 'Configure welcome messages for new members.',
  usage: 'set <#channel> | message <text> | preview | disable',
  cooldown: 3,
  permissions: ['ManageChannels'],

  async execute(message, args, client) {
    const db = getDb();
    const action = args[0]?.toLowerCase();

    // View current config
    if (!action) {
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.welcomeChannel) return message.reply(opts(responseBuilder.buildResult({ description: 'Welcome messages are **not configured**.\n\nUse `?welcome set <#channel>` to get started.'})));
      const ch = message.guild.channels.cache.get(gCfg.welcomeChannel);
      return message.reply(opts(responseBuilder.buildResult({ title: 'Welcome Configuration', fields: [{ name: 'Channel', value: ch ? ch.toString() : '`' + gCfg.welcomeChannel + '` (not found)', inline: true },
          { name: 'Message', value: gCfg.welcomeMsg ? '\`' + gCfg.welcomeMsg.slice(0, 200) + (gCfg.welcomeMsg.length > 200 ? '...' : '') + '\`' : '`Default`', inline: false }]})));
    }

    // Set channel
    if (action === 'set') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a channel or provide its ID.'})));
      if (!ch.isTextBased()) return message.reply(opts(responseBuilder.buildResult({ description: 'The channel must be a text channel.'})));
      await db.guildConfig.set(message.guild.id, { welcomeChannel: ch.id });
      const gCfg = await db.guildConfig.get(message.guild.id);
      const msg = gCfg.welcomeMsg || 'Welcome to {server}, {user}! You are member #{count}.';
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Welcome channel set to ${ch}.\n\n**Current message:**\n\`${msg}\`\n\nUse \`?welcome message <text>\` to customize.`})));
    }

    // Set message
    if (action === 'message' || action === 'msg') {
      const text = args.slice(1).join(' ');
      if (!text) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide the welcome message.\n\n**Variables:** `{user}`, `{server}`, `{count}`'})));
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.welcomeChannel) return message.reply(opts(responseBuilder.buildResult({ description: 'Set a welcome channel first: `?welcome set <#channel>`'})));
      await db.guildConfig.set(message.guild.id, { welcomeMsg: text });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Welcome message set to:\n\`${text}\``})));
    }

    // Preview
    if (action === 'preview') {
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.welcomeMsg) return message.reply(opts(responseBuilder.buildResult({ description: 'No custom welcome message set.'})));
      const preview = gCfg.welcomeMsg
        .replace(/{user}/g, message.member.toString())
        .replace(/{server}/g, message.guild.name)
        .replace(/{count}/g, String(message.guild.memberCount));
      const embed = responseBuilder.buildResult({ title: 'Welcome!', description: preview, thumbnail: message.author.displayAvatarURL({ size: 128 })});
      return message.reply(opts(embed));
    }

    // Disable
    if (action === 'disable' || action === 'off' || action === 'remove') {
      await db.guildConfig.set(message.guild.id, { welcomeChannel: null, welcomeMsg: null });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Welcome messages have been **disabled**.'})));
    }

    return message.reply(opts(responseBuilder.buildResult({ description: 'Unknown sub-command. Use `set`, `message`, `preview`, or `disable`.'})));
  },
};
