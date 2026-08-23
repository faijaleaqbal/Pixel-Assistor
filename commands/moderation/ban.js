const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { resolveUserArg } = require('../../utils/resolveUser');
const { canManageMember, checkBotPermissions } = require('../../utils/perms');
const logger = require('../../utils/logger');

module.exports = {
  name: 'ban',
  category: 'moderation',
  description: 'Ban a member from the server. Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['BanMembers'],
  args: true,

  async execute(message, args, client) {
    const targetUser = await resolveUserArg(message, args[0]);
    if (!targetUser) return;

    // 1. Bot permissions check
    const botCheck = checkBotPermissions(message, ['BanMembers']);
    if (!botCheck.ok) {
      return message.reply(
        opts(responseBuilder.buildResult({ description: '❌ I do not have permission to **Ban Members** in this server.'})),
      );
    }

    // 2. Hierarchy & target checks
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (member) {
      const check = canManageMember(message.member, member, message.guild, { actionName: 'ban' });
      if (!check.ok) {
        return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${check.error}`})));
      }
      if (!member.bannable) {
        return message.reply(opts(responseBuilder.buildResult({ description: '❌ I cannot ban that member — their highest role is equal to or above my highest role.'})));
      }
    } else {
      // User is not in the guild (hackban/ID ban)
      if (targetUser.id === message.guild.ownerId) {
        return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot ban the server owner.'})));
      }
      if (targetUser.id === message.author.id) {
        return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot ban yourself.'})));
      }
      if (targetUser.id === message.client.user.id) {
        return message.reply(opts(responseBuilder.buildResult({ description: '❌ I cannot ban myself.'})));
      }
    }

    const reason = args.slice(1).filter((a) => !/^<@!?\d+>$/.test(a)).join(' ') || 'No reason provided';
    try {
      await message.guild.bans.create(targetUser.id, { reason: `${reason} (by ${message.author.tag})` });
      return message.reply(opts(responseBuilder.buildResult({ description: `🔨 Banned **${targetUser.tag}** — ${reason}`})));
    } catch (e) {
      logger.error('ban error', e?.stack || e?.message || e);
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ Failed to ban this user. Please check role hierarchy and permissions.'})));
    }
  },
};
