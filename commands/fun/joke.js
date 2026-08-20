// src/commands/fun/joke.js
const { EmbedBuilder } = require('discord.js');
const { getJson } = require('../../utils/http');

module.exports = {
  name: 'joke',
  category: 'fun',
  description: 'Get a random joke.',
  usage: '',
  cooldown: 5,
  async execute(message) {
    try {
      const data = await getJson('https://v2.jokeapi.dev/joke/Any?safe-mode', { timeout: 6000, label: 'JokeAPI' });
      if (!data || data.error) throw new Error(data?.message || 'JokeAPI error');

      const desc = data.type === 'twopart' ? `**${data.setup}**\n\n||${data.delivery}||` : data.joke;
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('😂 Joke')
        .setDescription(desc || 'No joke text available.')
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to fetch joke. Please try again.')] });
    }
  },
};
