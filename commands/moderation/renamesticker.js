// src/commands/moderation/renamesticker.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'renamesticker',
  category: 'moderation',
  aliases: ['rst'],
  description: 'Rename a sticker. Usage: renamesticker <name|id> <newName>',
  usage: '<name|id> <newName>',
  cooldown: 3,
  permissions: ['ManageEmojisAndStickers'],
  args: true,
  async execute(message, args) {
    const q = args[0];
    const newName = args.slice(1).join('_');
    if (!newName) return message.reply('Provide a new name.');
    const stickers = await message.guild.stickers.fetch();
    const s = stickers.find((x) => x.id === q || x.name.toLowerCase() === q.toLowerCase());
    if (!s) return message.reply('Sticker not found.');
    await s.setName(newName);
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Renamed to \`${newName}\`.`)] });
  },
};
