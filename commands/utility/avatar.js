// src/commands/utility/avatar.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'avatar',
  category: 'utility',
  description: "Show a user's avatar. Accepts @user or raw userID.",
  usage: '[@user|userID]',
  aliases: ['av', 'pfp'],
  cooldown: 3,
  async execute(message, args) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true })) || message.author
      : message.author;
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    const url = member?.displayAvatarURL?.({ size: 4096, extension: 'png' }) || target.displayAvatarURL({ size: 4096, extension: 'png' });
    return message.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`🖼️ ${target.tag}'s avatar`)
        .setImage(url)
        .setTimestamp()],
      allowedMentions: { parse: [] },
    });
  },
};
