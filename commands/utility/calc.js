// src/commands/utility/calc.js
// Safe arithmetic calculator. Supports + - * / % ( ) and decimals.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'calc',
  aliases: ['c', 'calculate'],
  category: 'utility',
  description: 'Evaluate a math expression. Usage: calc <expression>',
  usage: '<expression>',
  cooldown: 3,
  args: true,
  async execute(message, args) {
    const expr = args.join(' ');
    if (!/^[\d+\-*/%().\s]+$/.test(expr)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Only digits, `+ - * / % ( )` and spaces are allowed.')] });
    }
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expr});`)();
      if (typeof result !== 'number' || !isFinite(result)) throw new Error('not a finite number');
      return message.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('🧮 Calculator').addFields(
        { name: 'Input', value: `\`${expr}\``, inline: false },
        { name: 'Result', value: `\`${result}\``, inline: false },
      )] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Invalid expression: ${e.message}`)] });
    }
  },
};
