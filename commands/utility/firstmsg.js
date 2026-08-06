// src/commands/utility/firstmsg.js
// Fetch and display the first message in the current channel.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'firstmsg',
  category: 'utility',
  description: 'Show the first message in this channel',
  usage: '',
  aliases: ['first-message'],
  cooldown: 5,
  async execute(message) {
    let messages;
    try {
      messages = await message.channel.messages.fetch({ limit: 1, after: '0' });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to fetch messages: **${e.message}**`)] });
    }
    const first = messages.first();
    if (!first) return message.reply('Could not find the first message.');

    const content = first.content?.slice(0, 1024) || '*No text content*';

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle('📜 First Message')
      .setURL(first.url)
      .addFields(
        { name: 'Author', value: `${first.author.tag} (${first.author.id})`, inline: true },
        { name: 'Date', value: `<t:${Math.floor(first.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Content', value: content, inline: false },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
