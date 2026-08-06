// src/commands/utility/translate.js
// Translate text using Google Translate.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'translate',
  aliases: ['tr'],
  category: 'utility',
  description: 'Translate text. Usage: translate [from-to] <text>',
  usage: '[from-to] <text>',
  cooldown: 5,
  async execute(message, args) {
    const full = args.join(' ');
    if (!full) return message.reply('Please provide text to translate.');

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
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      const translated = data[0].map((part) => part[0]).join('');
      const detectedLang = data[2];

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🌍 Translation')
        .addFields(
          { name: 'Detected / Source', value: detectedLang || sl, inline: true },
          { name: 'Target', value: tl, inline: true },
          { name: 'Original', value: text.slice(0, 1024), inline: false },
          { name: 'Translated', value: translated.slice(0, 1024), inline: false },
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Translation Failed')
        .setDescription('Could not translate the provided text.')
        .setTimestamp()] });
    }
  },
};
