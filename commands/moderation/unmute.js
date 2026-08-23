// src/commands/moderation/unmute.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'unmute',
  category: 'moderation',
  aliases: ['um'],
  description: "Remove a member's timeout. Accepts @user or raw userID.",
  usage: '<@user|userID>',
  cooldown: 3,
  permissions: ['ModerateMembers'],
  args: true,
  async execute(message, args, client) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    try {
      await target.timeout(null);
      return message.reply(opts(responseBuilder.buildResult({ description: `🔊 Unmuted ${target.user.tag}`})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed: ${e.message}`})));
    }
  },
};
