// src/commands/moderation/clone.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'clone',
  category: 'moderation',
  aliases: ['cln'],
  description: 'Clone the current (or mentioned) channel. Usage: clone [#channel] [newName]',
  usage: '[#channel] [newName]',
  cooldown: 3,
  permissions: ['ManageChannels'],
  async execute(message, args) {
    const src = message.mentions.channels.first() || message.channel;
    const newName = args.slice(message.mentions.channels.first() ? 1 : 0).join('-') || `${src.name}-clone`;
    try {
      const cloned = await src.clone({ name: newName });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Cloned to <#${cloned.id}>.`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Clone failed: **${e.message}**`)] });
    }
  },
};
