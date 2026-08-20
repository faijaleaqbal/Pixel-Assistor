// src/commands/fun/meme.js
const { EmbedBuilder } = require('discord.js');
const { getJson } = require('../../utils/http');

module.exports = {
  name: 'meme',
  category: 'fun',
  description: 'Get a random meme from Reddit.',
  usage: '',
  cooldown: 5,
  async execute(message) {
    try {
      const data = await getJson('https://meme-api.com/gimme', { timeout: 6000, label: 'Meme API' });
      if (!data || !data.url) throw new Error('No meme returned');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(data.title ? data.title.slice(0, 256) : 'Meme')
        .setURL(data.postLink || 'https://reddit.com')
        .setImage(data.url)
        .setFooter({ text: `r/${data.subreddit || 'memes'}` });

      return message.reply({ embeds: [embed] });
    } catch {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to fetch meme. Please try again.')] });
    }
  },
};
