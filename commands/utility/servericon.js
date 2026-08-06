// src/commands/utility/servericon.js
// Show the server's icon.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'servericon',
  category: 'utility',
  description: 'Show the server icon',
  usage: '',
  aliases: ['siicon', 'guildicon'],
  cooldown: 3,
  async execute(message) {
    const guild = message.guild;
    const icon = guild.iconURL({ size: 4096, extension: 'png' });

    if (!icon) {
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle(`🏠 ${guild.name}`)
        .setDescription('This server has no icon.')
        .setTimestamp()] });
    }

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(`🏠 ${guild.name}`)
      .setImage(icon)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
