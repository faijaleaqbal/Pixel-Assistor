// src/commands/upi/upi.js
// Share one of your saved UPI IDs.

const responseBuilder = require('../../utils/responseBuilder');
const config = require('../../utils/config');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'upi',
  category: 'upi',
  description: 'Share one of your saved UPI IDs. Usage: upi <label>',
  usage: '<label>',
  cooldown: 3,
  args: true,
  async execute(message, args, client) {
    const label = args[0];
    const rows = await getDb().upi.list(message.author.id);
    const found = rows.find((r) => r.label.toLowerCase() === label.toLowerCase());
    if (!found) return message.reply(opts(responseBuilder.buildResult({ description: `No saved UPI under label \`${label}\`. Run \`${config.prefix}listupi\` to see your labels.`})));
    return message.reply(opts(responseBuilder.buildResult({ title: `💸 ${message.author.username}'s UPI`, fields: [{ name: 'Label', value: found.label, inline: true },
      { name: 'UPI ID', value: `\`${found.upiId}\``, inline: true },]})));
  },
};
