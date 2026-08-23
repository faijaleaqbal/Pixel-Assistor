// src/commands/moderation/softban.js
// Ban then immediately unban — removes messages from last 24h but user can rejoin.
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'softban',
  aliases: ['sb'],
  category: 'moderation',
  description: 'Softban a user (ban + unban, clears recent messages). Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['BanMembers'],
  args: true,
  async execute(message, args, client) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;

    if (target.id === message.guild.ownerId) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot softban the server owner.'})));
    }
    if (target.id === message.author.id) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot softban yourself.'})));
    }
    if (target.id === message.client.user.id) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ I cannot softban myself.'})));
    }
    if (message.author.id !== message.guild.ownerId && message.member.roles.highest.position <= target.roles.highest.position) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot softban that member — they have an equal or higher role than you.'})));
    }
    if (!target.bannable) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ I cannot softban that member — they have an equal or higher role than me.'})));
    }

    const reason = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided.';
    try {
      await target.ban({ deleteMessageSeconds: 86400, reason: `Softban: ${reason} (by ${message.author.tag})` });
      await message.guild.members.unban(target.id, 'Softban — auto-unban').catch(() => {});
      return message.reply(opts(responseBuilder.buildResult({ description: `🔨 **${target.user.tag}** was softbanned. Messages from last 24h deleted.\n**Reason:** ${reason}`})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to softban: ${e.message}`})));
    }
  },
};

