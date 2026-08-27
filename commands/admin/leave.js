// src/commands/admin/leave.js
// Configure leave messages for members who leave the server.
// Usage:
//   ?leave set <#channel>
//   ?leave message <text>   (use {user}, {server} as variables)
//   ?leave preview
//   ?leave disable
//   ?leave

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');
const { isTrustedOwner } = require('../../utils/perms');

module.exports = {
  name: 'leave',
  category: 'admin',
  description: 'Configure leave messages.',
  usage: 'set <#channel> | message <text> | preview | disable',
  cooldown: 3,
  ownerOnly: true,
  permissions: ['ManageChannels'],

  async execute(message, args, client) {
    const isAuthorized = await isTrustedOwner(message.author.id, message.guild);
    if (!isAuthorized) {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: 'Access Denied',
          description: "❌ You don't have permission to use this command. This command is restricted to Server Owners & Trusted Owners.",
        }))
      );
    }

    const db = getDb();
    const action = args[0]?.toLowerCase();

    // View current config
    if (!action) {
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.leaveChannel) return message.reply(opts(responseBuilder.buildResult({ description: 'Leave messages are **not configured**.\n\nUse `?leave set <#channel>` to get started.'})));
      const ch = message.guild.channels.cache.get(gCfg.leaveChannel);
      return message.reply(opts(responseBuilder.buildResult({ title: 'Leave Configuration', fields: [{ name: 'Channel', value: ch ? ch.toString() : '`' + gCfg.leaveChannel + '` (not found)', inline: true },
          { name: 'Message', value: gCfg.leaveMsg ? '`' + gCfg.leaveMsg.slice(0, 200) + (gCfg.leaveMsg.length > 200 ? '...' : '') + '`' : '`Default`', inline: false }]})));
    }

    // Set channel
    if (action === 'set') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention a channel or provide its ID.'})));
      if (!ch.isTextBased()) return message.reply(opts(responseBuilder.buildResult({ description: 'The channel must be a text channel.'})));
      await db.guildConfig.set(message.guild.id, { leaveChannel: ch.id });
      const gCfg = await db.guildConfig.get(message.guild.id);
      const msg = gCfg.leaveMsg || 'Goodbye, {user}. We will miss you!';
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Leave channel set to ${ch}.\n\n**Current message:**\n` + '`' + msg + '`' + '\n\nUse `?leave message <text>` to customize.'})));
    }

    // Set message
    if (action === 'message' || action === 'msg') {
      const text = args.slice(1).join(' ');
      if (!text) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide the leave message.\n\n**Variables:** `{user}`, `{server}`'})));
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.leaveChannel) return message.reply(opts(responseBuilder.buildResult({ description: 'Set a leave channel first: `?leave set <#channel>`'})));
      await db.guildConfig.set(message.guild.id, { leaveMsg: text });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Leave message set to:\n` + '`' + text + '`'})));
    }

    // Preview
    if (action === 'preview') {
      const gCfg = await db.guildConfig.get(message.guild.id);
      if (!gCfg?.leaveMsg) return message.reply(opts(responseBuilder.buildResult({ description: 'No custom leave message set.'})));
      const preview = gCfg.leaveMsg
        .replace(/{user}/g, message.author.tag)
        .replace(/{server}/g, message.guild.name);
      const embed = responseBuilder.buildResult({ title: 'Goodbye!', description: preview, thumbnail: message.author.displayAvatarURL({ size: 128 })});
      return message.reply(opts(embed));
    }

    // Disable
    if (action === 'disable' || action === 'off' || action === 'remove') {
      await db.guildConfig.set(message.guild.id, { leaveChannel: null, leaveMsg: null });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Leave messages have been **disabled**.'})));
    }

    return message.reply(opts(responseBuilder.buildResult({ description: 'Unknown sub-command. Use `set`, `message`, `preview`, or `disable`.'})));
  },
};
