// src/commands/utility/translate.js
// Translate text using Google Translate GTX endpoint.

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');
const { getJson } = require('../../utils/http');

module.exports = {
  name: 'translate',
  aliases: ['tr'],
  category: 'utility',
  description: 'Translate text. Usage: translate [from-to] <text>',
  usage: '[from-to] <text>',
  cooldown: 5,
  async execute(message, args, client) {
    const full = args.join(' ');
    if (!full) return message.reply(opts(buildContainer({ description: 'Please provide text to translate.' })));

    let sl = 'auto';
    let tl = 'en';
    let text = full;

    const langMatch = full.match(/^([a-z]{2})-([a-z]{2})\s+(.+)/i);
    if (langMatch) {
      sl = langMatch[1].toLowerCase();
      tl = langMatch[2].toLowerCase();
      text = langMatch[3];
    }

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
      const data = await getJson(url, { timeout: 7000, label: 'Google Translate' });
      if (!Array.isArray(data) || !data[0]) throw new Error('Invalid response from translation service');

      const translated = data[0].map((part) => part[0]).join('');
      const detectedLang = data[2] || sl;

      const embed = responseBuilder.buildResult({ title: '🌍 Translation', fields: [{ name: 'Source / Detected', value: detectedLang, inline: true },
          { name: 'Target', value: tl, inline: true },
          { name: 'Original', value: text.slice(0, 1024), inline: false },
          { name: 'Translated', value: translated.slice(0, 1024), inline: false },]});

      return message.reply(opts(embed));
    } catch {
      return message.reply(
        opts(responseBuilder.buildResult({ title: '❌ Translation Failed', description: 'Could not translate the provided text. Please try again.'})),
      );
    }
  },
};
