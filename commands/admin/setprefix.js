// src/commands/admin/setprefix.js
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');
const { setPrefix } = require('../../utils/prefixCache');
const { isTrustedOwner } = require('../../utils/perms');

module.exports = {
  name: 'setprefix',
  category: 'admin',
  aliases: ['prefix'],
  description: 'Change the bot prefix for this server.',
  usage: '<new-prefix|default|reset>',
  cooldown: 5,
  ownerOnly: true,
  permissions: ['Administrator'],
  args: true,
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

    const input = args[0];
    const isReset = input.toLowerCase() === 'default' || input.toLowerCase() === 'reset';
    const targetPrefix = isReset ? (config.prefix || '?') : input;

    if (!isReset && (targetPrefix.length < 1 || targetPrefix.length > 5)) {
      return message.reply(opts(responseBuilder.buildResult({ description: 'Prefix must be between 1 and 5 characters.'})));
    }

    try {
      const db = getDb();
      await db.guildConfig.set(message.guild.id, { prefix: isReset ? null : targetPrefix });
      setPrefix(message.guild.id, targetPrefix);

      return message.reply(opts(responseBuilder.buildResult({ title: '✅ Prefix Updated', description: `The server prefix is now set to \`${targetPrefix}\`.\nExample: \`${targetPrefix}help\``})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to update prefix: ${e.message}`})));
    }
  },
};

