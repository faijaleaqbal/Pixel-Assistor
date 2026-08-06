// src/commands/utility/banner.js
// Show user or server banner.
//   ?banner           -> author's banner
//   ?banner user <@user|userID>   -> user's banner
//   ?banner server    -> server banner

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'banner',
  category: 'utility',
  aliases: ['bn'],
  description: "Show a user's or server's banner. Accepts @user or raw userID.",
  usage: '[@user|userID | server]',
  cooldown: 3,
  async execute(message, args) {
    const sub = (args[0] || '').toLowerCase();

    // ?banner server
    if (sub === 'server') {
      const banner = message.guild.bannerURL({ size: 1024, extension: 'png' });
      if (!banner) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('This server has no banner.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle(`\uD83C\uDFE0 ${message.guild.name}'s banner`).setImage(banner).setTimestamp()] });
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
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to fetch user: ${e.message}`)] });
    }
    const banner = u.bannerURL({ size: 4096, extension: 'png' });
    if (!banner) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`${target.tag} has no banner.`)] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle(`\uD83D\uDDBC\uFE0F ${target.tag}'s banner`).setImage(banner).setTimestamp()] });
  },
};
