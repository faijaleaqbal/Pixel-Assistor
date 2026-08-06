// src/commands/admin/setprefix.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
module.exports = {
  name: 'setprefix',
  category: 'admin',
  description: 'Change the bot prefix at runtime (owner only, in-memory only — restart resets).',
  usage: '<new-prefix>',
  cooldown: 5,
  ownerOnly: true,
  args: true,
  async execute(message, args) {
    const newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 5) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Prefix must be 1-5 characters.')] });
    // NOTE: This is a runtime-only change. The new prefix is NOT persisted to .env,
    // so it will reset on the next process restart. To make it permanent, update
    // the PREFIX= line in your .env file.
    config.prefix = newPrefix;
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Prefix changed to \`${newPrefix}\` (runtime only — restart resets it).`)] });
  },
};
