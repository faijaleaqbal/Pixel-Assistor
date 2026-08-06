// src/commands/moderation/untimeout.js
const { EmbedBuilder } = require('discord.js');
const { resolveMemberArg } = require('../../utils/resolveUser');
module.exports = {
  name: 'untimeout', aliases: ['unto'], category: 'moderation',
  description: 'Remove timeout from a member. Accepts @user or raw userID.',
  usage: '<@user|userID>',
  cooldown: 3, permissions: ['ModerateMembers'], args: true,
  async execute(message, args) {
    const target = await resolveMemberArg(message, args[0]);
    if (!target) return;
    try {
      await target.timeout(null);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ ${target.user.tag} is no longer timed out.`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${e.message}`)] });
    }
  },
};
