// src/commands/moderation/renameemoji.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'renameemoji',
  category: 'moderation',
  aliases: ['rme'],
  description: 'Rename an emoji. Usage: renameemoji <emoji> <newName>',
  usage: '<emoji> <newName>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args) {
    const match = args[0].match(/<a?:\w+:(\d+)>/);
    if (!match) return message.reply('Provide a custom emoji.');
    const name = args.slice(1).join('_');
    if (!name) return message.reply('Provide a new name.');
    const emoji = await message.guild.emojis.fetch(match[1]).catch(() => null);
    if (!emoji) return message.reply('Emoji not found.');
    await emoji.setName(name);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Renamed to \`${name}\`.`)] });
  },
};
