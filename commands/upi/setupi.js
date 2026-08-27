// src/commands/upi/setupi.js

const responseBuilder = require('../../utils/responseBuilder');
const config = require('../../utils/config');
const { opts } = require('../../utils/v2Reply');
const { getDb } = require('../../utils/db');
const { getPrefix } = require('../../utils/prefixCache');

module.exports = {
  name: 'setupi',
  aliases: ['set-upi', 'saveupi', 'su'],
  category: 'upi',
  description: 'Save or update a UPI ID. Usage: setupi <label> <upi-id>',
  usage: '<label> <upi-id>',
  cooldown: 3,
  args: true,
  async execute(message, args, client) {
    const prefix = await getPrefix(message.guild?.id);
    const label = args[0];
    const upiId = args[1];
    if (!label || !upiId) return message.reply(opts(responseBuilder.buildResult({ description: `Usage: \`${prefix}setupi <label> <upi-id>\`\nExample: \`${prefix}setupi Mbk name@bank\``})));
    if (!/^[\w.\-]+@[\w.\-]+$/.test(upiId)) return message.reply(opts(responseBuilder.buildResult({ description: 'That doesn\'t look like a valid UPI ID (expected `name@bank`).'})));
    await getDb().upi.set(message.author.id, label, upiId);
    return message.reply(opts(responseBuilder.buildResult({ description: `✅ Saved UPI \`${upiId}\` under label \`${label}\`.`})));
  },
};
