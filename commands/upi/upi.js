// src/commands/upi/upi.js
// Share one of your saved UPI IDs.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'upi',
  category: 'upi',
  description: 'Share one of your saved UPI IDs. Usage: upi <label>',
  usage: '<label>',
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const label = args[0];
    const rows = await getDb().upi.list(message.author.id);
    const found = rows.find((r) => r.label.toLowerCase() === label.toLowerCase());
    if (!found) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`No saved UPI under label \`${label}\`. Run \`${config.prefix}listupi\` to see your labels.`)] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle(`💸 ${message.author.username}'s UPI`).addFields(
      { name: 'Label', value: found.label, inline: true },
      { name: 'UPI ID', value: `\`${found.upiId}\``, inline: true },
    ).setTimestamp()] });
  },
};
