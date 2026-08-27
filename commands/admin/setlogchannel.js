const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');
const { isTrustedOwner } = require('../../utils/perms');

module.exports = {
  name: 'setlogchannel',
  aliases: ['slc', 'logchannel'],
  category: 'admin',
  description: 'Set the server log channel.',
  usage: '<#channel>',
  cooldown: 3,
  ownerOnly: true,
  permissions: ['ManageChannels'],
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

    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
    if (!ch) return message.reply(opts(responseBuilder.buildResult({ description: 'Mention or provide a channel ID.'})));
    await getDb().guildConfig.set(message.guild.id, { logChannel: ch.id });
    return message.reply(opts(responseBuilder.buildResult({ description: `✅ Log channel set to ${ch}.`})));
  },
};
