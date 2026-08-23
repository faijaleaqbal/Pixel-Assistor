// src/commands/fun/meme.js
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
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

      const embed = responseBuilder.buildResult({ title: data.title ? data.title.slice(0, 256) : 'Meme', image: data.url});

      return message.reply(opts(embed));
    } catch {
      return message.reply(opts(responseBuilder.buildResult({ description: 'Failed to fetch meme. Please try again.'})));
    }
  },
};
