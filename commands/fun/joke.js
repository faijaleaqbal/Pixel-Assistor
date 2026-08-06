// src/commands/fun/joke.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'joke', category: 'fun', description: 'Get a random joke.', usage: '', cooldown: 5,
  async execute(message) {
    try {
      const res = await fetch('https://v2.jokeapi.dev/joke/Any?safe-mode');
      if (!res.ok) throw new Error(`JokeAPI returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message);
      const desc = data.type === 'twopart' ? `**${data.setup}**\n||${data.delivery}||` : data.joke;
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('😂 Joke').setDescription(desc)] });
    } catch {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to fetch joke.')] });
    }
  },
};
