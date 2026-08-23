// src/commands/utility/banner.js
// Show user or server banner.
//   ?banner           -> author's banner
//   ?banner user <@user|userID>   -> user's banner
//   ?banner server    -> server banner

const responseBuilder = require('../../utils/responseBuilder');
const { resolveUserArg } = require('../../utils/resolveUser');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'banner',
  category: 'utility',
  aliases: ['bn'],
  description: "Show a user's or server's banner. Accepts @user or raw userID.",
  usage: '[@user|userID | server]',
  cooldown: 3,
  async execute(message, args, client) {
    const sub = (args[0] || '').toLowerCase();

    // ?banner server
    if (sub === 'server') {
      const banner = message.guild.bannerURL({ size: 1024, extension: 'png' });
      if (!banner) return message.reply(opts(responseBuilder.buildResult({ description: 'This server has no banner.'})));
      return message.reply(opts(responseBuilder.buildResult({ title: `\uD83C\uDFE0 ${message.guild.name}'s banner`, image: banner})));
    }

    // ?banner user <@user|userID>  OR  ?banner <@user|userID>  OR  ?banner (self)
    // For the "user" subcommand, the user-arg is at index 1. Otherwise at index 0.
    const userArgIndex = sub === 'user' ? 1 : 0;
    const userArg = args[userArgIndex];
    const target = userArg
      ? (await resolveUserArg(message, userArg, { silent: true })) || message.author
      : message.author;

    let u;
    try {
      u = await message.client.users.fetch(target.id, { force: true });
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to fetch user: ${e.message}`})));
    }
    const banner = u.bannerURL({ size: 4096, extension: 'png' });
    if (!banner) return message.reply(opts(responseBuilder.buildResult({ description: `${target.tag} has no banner.`})));
    return message.reply(opts(responseBuilder.buildResult({ title: `\uD83D\uDDBC\uFE0F ${target.tag}'s banner`, image: banner})));
  },
};
