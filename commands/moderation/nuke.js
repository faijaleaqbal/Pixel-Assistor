// src/commands/moderation/nuke.js
// Clone current channel with same settings, delete original.

const responseBuilder = require('../../utils/responseBuilder');
const { checkBotPermissions, isTrustedOwner } = require('../../utils/perms');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'nuke',
  category: 'moderation',
  aliases: ['nk'],
  description: 'Nuke the current channel (clone + delete original).',
  usage: '',
  cooldown: 5,
  ownerOnly: true,
  permissions: ['ManageChannels'],
  async execute(message) {
    const isAuthorized = await isTrustedOwner(message.author.id, message.guild);
    if (!isAuthorized) {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: 'Access Denied',
          description: "❌ You don't have permission to use this command. This command is restricted to Server Owners & Trusted Owners.",
        }))
      );
    }

    const old = message.channel;

    // Check bot permissions
    const botCheck = checkBotPermissions(message, ['ManageChannels']);
    if (!botCheck.ok) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ I need the **ManageChannels** permission in this channel to nuke it.'})),
      );
    }

    // Guard essential community channels
    if (message.guild.rulesChannelId === old.id || message.guild.publicUpdatesChannelId === old.id || message.guild.systemChannelId === old.id) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ Cannot nuke server system, rules, or community updates channels.'})),
      );
    }

    if (!old.deletable) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ This channel is not deletable by the bot.'})),
      );
    }

    try {
      const pos = old.rawPosition;
      const created = await old.clone({ position: pos });
      await old.delete(`Nuked by ${message.author.tag}`);
      return created.send(opts(responseBuilder.buildResult({ description: `💥 Channel nuked by ${message.author}.`}))).catch(() => {});
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `❌ Nuke failed: **${e.message}**`}))).catch(() => {});
    }
  },
};
