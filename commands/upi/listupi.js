// src/commands/upi/listupi.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'listupi',
  aliases: ['lsupi', 'upis', 'lu'],
  category: 'upi',
  description: 'List all your saved UPI IDs.',
  usage: '',
  cooldown: 3,
  async execute(message) {
    const rows = await getDb().upi.list(message.author.id);
    if (!rows.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('You have no saved UPI IDs. Use `' + config.prefix + 'setupi <label> <upi-id>`.')] });
    const fields = rows.map((r) => ({ name: r.label, value: `\`${r.upiId}\``, inline: true }));
    return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('💸 Your UPI IDs').addFields(fields).setTimestamp()] });
  },
};
