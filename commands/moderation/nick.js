// src/commands/moderation/nick.js

const responseBuilder = require('../../utils/responseBuilder');
const { resolveMemberArg } = require('../../utils/resolveUser');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'nick',
  aliases: ['nickname', 'setnick'],
  category: 'moderation',
  description: "Change a member's nickname. Accepts @user or raw userID.",
  usage: '<@user|userID> <new nickname|reset>',
  cooldown: 3,
  permissions: ['ManageNicknames'],
  args: true,
  async execute(message, args, client) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;

    if (target.id === message.guild.ownerId && message.author.id !== message.guild.ownerId) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot change the server owner\'s nickname.'})));
    }
    if (message.author.id !== message.guild.ownerId && target.id !== message.author.id && message.member.roles.highest.position <= target.roles.highest.position) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ You cannot change the nickname of a member with an equal or higher role than you.'})));
    }
    if (!target.manageable && target.id !== message.client.user.id) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ I cannot change that member\'s nickname — their role is higher than mine.'})));
    }

    const newNick = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a)).join(' ');
    if (!newNick) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a new nickname or `reset`.'})));

    if (newNick !== 'reset' && newNick.length > 32) {
      return message.reply(opts(responseBuilder.buildResult({ description: '❌ Nicknames must be 32 characters or fewer.'})));
    }

    try {
      await target.setNickname(newNick === 'reset' ? null : newNick);
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Nickname ${newNick === 'reset' ? 'reset' : `set to **${newNick}**`} for **${target.user.tag}**.`})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to set nickname: ${e.message}`})));
    }
  },
};

