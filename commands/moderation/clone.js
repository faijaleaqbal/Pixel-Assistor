// src/commands/moderation/clone.js
// Clone the current (or mentioned) channel directly with identical settings and name.

const responseBuilder = require('../../utils/responseBuilder');
const { checkBotPermissions, isTrustedOwner } = require('../../utils/perms');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'clone',
  category: 'moderation',
  aliases: ['cln'],
  description: 'Clone the current (or mentioned) channel with identical settings and name.',
  usage: '[#channel] [newName]',
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

    // 1. Check Bot permissions
    const botCheck = checkBotPermissions(message, ['ManageChannels']);
    if (!botCheck.ok) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ I need the **ManageChannels** permission to clone channels.' }))
      );
    }

    const mentionedChannel = (typeof message.mentions?.channels?.first === 'function')
      ? message.mentions.channels.first()
      : null;
    const src = mentionedChannel || message.channel;

    if (!src || typeof src.clone !== 'function') {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ This channel type cannot be cloned.' }))
      );
    }

    // Determine custom name if user explicitly specified one, otherwise preserve exact original name (no suffix)
    const rawNameArg = (args || []).slice(mentionedChannel ? 1 : 0).join('-').trim();
    const targetName = rawNameArg.length > 0 ? rawNameArg : src.name;

    try {
      const cloned = await src.clone({
        name: targetName,
        reason: `Cloned by ${message.author.tag} (${message.author.id})`,
      });

      return message.reply(
        opts(responseBuilder.buildResult({
          title: '✅ Channel Cloned',
          description: `Successfully cloned **#${src.name}** to <#${cloned.id}> with identical settings.`,
        }))
      );
    } catch (e) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: `❌ Clone failed: **${e.message}**` }))
      );
    }
  },
};
