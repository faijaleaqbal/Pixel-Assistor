// src/commands/fun/meme.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'meme', category: 'fun', description: 'Get a random meme.', usage: '', cooldown: 5,
  async execute(message) {
    try {
      const res = await fetch('https://meme-api.com/gimme');
      if (!res.ok) throw new Error(`meme-api returned ${res.status}`);
      const data = await res.json();
      if (!data.url) throw new Error('No meme');
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(data.title || 'Meme').setURL(data.postLink || '').setImage(data.url).setFooter({ text: `r/${data.subreddit || 'memes'}` })] });
    } catch {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to fetch meme. Try again.')] });
    }
  },
};
