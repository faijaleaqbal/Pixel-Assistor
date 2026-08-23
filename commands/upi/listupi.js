// src/commands/upi/listupi.js

const responseBuilder = require('../../utils/responseBuilder');
const config = require('../../utils/config');
const { opts } = require('../../utils/v2Reply');
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
    if (!rows.length) return message.reply(opts(responseBuilder.buildResult({ description: 'You have no saved UPI IDs. Use `' + config.prefix + 'setupi <label> <upi-id>`.'})));
    const fields = rows.map((r) => ({ name: r.label, value: `\`${r.upiId}\``, inline: true }));
    return message.reply(opts(responseBuilder.buildResult({ title: '💸 Your UPI IDs', fields })));
  },
};
