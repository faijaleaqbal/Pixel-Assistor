// src/commands/moderation/clearwarns.js
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');
const { resolveMemberArg } = require('../../utils/resolveUser');
const { canManageMember } = require('../../utils/perms');

module.exports = {
  name: 'clearwarns',
  aliases: ['cw'],
  category: 'moderation',
  description: 'Clear all warnings for a member. Accepts @user or raw userID.',
  usage: '<@user|userID>',
  cooldown: 3,
  permissions: ['ModerateMembers'],
  args: true,
  async execute(message, args, client) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;

    const check = canManageMember(message.member, target, message.guild, { actionName: 'clear warnings for' });
    if (!check.ok) {
      return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${check.error}`})));
    }

    const count = await getDb().warn.clear(target.id, message.guild.id);
    return message.reply(opts(responseBuilder.buildResult({ description: `✅ Cleared ${count} warning(s) for ${target.user.tag}.`})));
  },
};
