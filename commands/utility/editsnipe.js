// src/commands/utility/editsnipe.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const snipe = require('../../utils/snipeCache');

module.exports = {
  name: 'editsnipe',
  aliases: ['es'],
  category: 'utility',
  description: 'Show recently edited messages in this channel. Usage: editsnipe [count]',
  usage: '[count]',
  cooldown: 3,
  async execute(message, args) {
    const n = Math.min(parseInt(args[0], 10) || 1, 10);
    const list = snipe.getEdited(message.channelId, n);
    if (!list.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('Nothing to editsnipe.')] });
    const embeds = list.filter((e) => e.author).map((e) => new EmbedBuilder()
      .setColor(config.embedColor)
      .setAuthor({ name: e.author.tag, iconURL: e.author.displayAvatarURL() })
      .addFields(
        { name: 'Before', value: (e.before || '').slice(0, 1024) || '(empty)' },
        { name: 'After', value: (e.after || '').slice(0, 1024) || '(empty)' },
      )
      .setFooter({ text: `Edited ${new Date(e.time).toLocaleString()}` }));
    return message.reply({ embeds });
  },
};
