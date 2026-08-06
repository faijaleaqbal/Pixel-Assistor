// src/commands/upi/removeupi.js

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'removeupi',
  aliases: ['rmupi', 'delupi', 'ru'],
  category: 'upi',
  description: 'Remove a saved UPI ID. Usage: removeupi <label>',
  usage: '<label>',
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const label = args[0];
    const removed = await getDb().upi.remove(message.author.id, label);
    if (!removed) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`No saved UPI under label \`${label}\`.`)] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🗑️ Removed UPI \`${label}\`.`)] });
  },
};
