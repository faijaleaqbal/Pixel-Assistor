// src/commands/moderation/nick.js

const { EmbedBuilder } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'nick',
  category: 'moderation',
  description: "Change a member's nickname. Accepts @user or raw userID.",
  usage: '<@user|userID> <new nickname|reset>',
  cooldown: 3,
  permissions: ['ManageNicknames'],
  args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    const newNick = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a)).join(' ');
    if (!newNick) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a new nickname or `reset`.')] });
    try {
      await target.setNickname(newNick === 'reset' ? null : newNick);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Nickname updated for ${target.user.tag}.`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${e.message}`)] });
    }
  },
};
