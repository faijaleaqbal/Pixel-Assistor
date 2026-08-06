// src/commands/upi/setupi.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'setupi',
  aliases: ['set-upi', 'saveupi', 'su'],
  category: 'upi',
  description: 'Save or update a UPI ID. Usage: setupi <label> <upi-id>',
  usage: '<label> <upi-id>',
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const label = args[0];
    const upiId = args[1];
    if (!label || !upiId) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Usage: \`${config.prefix}setupi <label> <upi-id>\`\nExample: \`${config.prefix}setupi Mbk name@bank\``)] });
    if (!/^[\w.\-]+@[\w.\-]+$/.test(upiId)) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That doesn\'t look like a valid UPI ID (expected `name@bank`).')] });
    await getDb().upi.set(message.author.id, label, upiId);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Saved UPI \`${upiId}\` under label \`${label}\`.`)] });
  },
};
