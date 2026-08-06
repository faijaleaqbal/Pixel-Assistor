// src/commands/moderation/delsticker.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'delsticker',
  category: 'moderation',
  aliases: ['dst'],
  description: 'Delete a sticker by name or ID. Usage: delsticker <name|id>',
  usage: '<name|id>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args) {
    const q = args.join(' ');
    const stickers = await message.guild.stickers.fetch();
    const s = stickers.find((x) => x.id === q || x.name.toLowerCase() === q.toLowerCase());
    if (!s) return message.reply('Sticker not found.');
    await s.delete();
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🗑️ Deleted sticker \`${s.name}\`.`)] });
  },
};
