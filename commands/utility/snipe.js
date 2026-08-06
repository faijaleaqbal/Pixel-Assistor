// src/commands/utility/snipe.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const snipe = require('../../utils/snipeCache');

module.exports = {
  name: 'snipe',
  aliases: ['s', 'sn'],
  category: 'utility',
  description: 'Show recently deleted messages in this channel. Usage: snipe [count]',
  usage: '[count]',
  cooldown: 3,
  async execute(message, args) {
    const n = Math.min(parseInt(args[0], 10) || 1, 10);
    const list = snipe.getDeleted(message.channelId, n);
    if (!list.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('Nothing to snipe.')] });
    const embeds = list.filter((e) => e.author).map((e) => new EmbedBuilder()
      .setColor(config.embedColor)
      .setAuthor({ name: e.author.tag, iconURL: e.author.displayAvatarURL() })
      .setDescription(e.content || '(empty)')
      .setFooter({ text: `Deleted ${new Date(e.time).toLocaleString()}` })
      .setImage(e.attachment || null));
    return message.reply({ embeds });
  },
};
