// src/commands/moderation/delemoji.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'delemoji',
  category: 'moderation',
  aliases: ['dme'],
  description: 'Delete an emoji. Usage: delemoji <emoji>',
  usage: '<emoji>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args) {
    const match = args[0].match(/<a?:\w+:(\d+)>/);
    if (!match) return message.reply('Provide a custom emoji.');
    const emoji = await message.guild.emojis.fetch(match[1]).catch(() => null);
    if (!emoji) return message.reply('Emoji not found in this guild.');
    await emoji.delete();
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🗑️ Deleted emoji \`${emoji.name}\`.`)] });
  },
};
