// src/commands/utility/servericon.js
// Show the server's icon.

const responseBuilder = require('../../utils/responseBuilder');

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
      return message.reply({ embeds: [responseBuilder.buildResult({ title: `🏠 ${guild.name}`, description: 'This server has no icon.'})] });
    }

    const embed = responseBuilder.buildResult({ title: `🏠 ${guild.name}`, image: icon});

    return message.reply({ embeds: [embed] });
  },
};
