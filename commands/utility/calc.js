// src/commands/utility/calc.js
// Safe arithmetic calculator. Evaluates math expressions deterministically without eval.

const { EmbedBuilder, ApplicationCommandOptionType } = require('discord.js');
const config = require('../../utils/config');
const { evaluate } = require('../../utils/mathEval');

module.exports = {
  name: 'calc',
  aliases: ['c', 'calculate'],
  category: 'utility',
  description: 'Evaluate a math expression safely.',
  usage: '<expression>',
  cooldown: 3,
  args: true,
  slash: true,
  slashOptions: [
    {
      name: 'expression',
      description: 'The math expression to calculate (e.g. 25 * 4 + 10)',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  async execute(message, args) {
    const expr = args.join(' ');
    const embed = evaluateMath(expr);
    return message.reply({ embeds: [embed] });
  },
  async slashExecute(interaction) {
    const expr = interaction.options.getString('expression', true);
    const embed = evaluateMath(expr);
    return interaction.reply({ embeds: [embed] });
  },
};

function evaluateMath(expr) {
  try {
    const result = evaluate(expr);
    return new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle('🧮 Calculator')
      .addFields(
        { name: 'Input', value: `\`${expr}\``, inline: true },
        { name: 'Result', value: `\`${result}\``, inline: true },
      )
      .setTimestamp();
  } catch (e) {
    return new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Invalid expression: ${e.message}`);
  }
}
