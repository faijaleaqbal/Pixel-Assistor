// src/commands/utility/invite.js
// Show the bot's invite link.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'invite',
  aliases: ['inv'],
  category: 'utility',
  description: 'Get the bot invite link',
  usage: '',
  cooldown: 5,
  async execute(message) {
    const clientId = config.clientId;
    if (!clientId) return message.reply('Bot client ID is not configured.');

    const link = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔗 Invite Me')
      .setDescription(`[Click here to invite me](${link})`)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
