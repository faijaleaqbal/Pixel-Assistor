// src/commands/moderation/unban.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'unban',
  category: 'moderation',
  aliases: ['ub'],
  description: 'Unban a user by @mention or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['BanMembers'],
  args: true,
  async execute(message, args, client) {
    // Resolve via mention or raw ID (Bans.fetch will reject if not banned).
    const target = await resolveUserArg(message, args[0]);
    if (!target) return;
    const reason = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a) && !/^\d{17,19}$/.test(a)).join(' ') || 'No reason provided';
    try {
      await message.guild.bans.remove(target.id, reason);
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Unbanned ${target.tag} — ${reason}`})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed: ${e.message}`})));
    }
  },
};
