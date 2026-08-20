// src/commands/upi/removeupi.js

const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'removeupi',
  aliases: ['rmupi', 'delupi', 'ru'],
  category: 'upi',
  description: 'Remove a saved UPI ID. Usage: removeupi <label>',
  usage: '<label>',
  cooldown: 3,
  args: true,
  async execute(message, args, client) {
    const label = args[0];
    const removed = await getDb().upi.remove(message.author.id, label);
    if (!removed) return message.reply({ embeds: [responseBuilder.buildResult({ description: `No saved UPI under label \`${label}\`.`})] });
    return message.reply({ embeds: [responseBuilder.buildResult({ description: `🗑️ Removed UPI \`${label}\`.`})] });
  },
};
