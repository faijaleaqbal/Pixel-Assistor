const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/calc.js
// Safe arithmetic calculator. Evaluates math expressions deterministically without eval.

const { ApplicationCommandOptionType } = require('discord.js');
const { evaluate } = require('../../utils/mathEval');
const { opts } = require('../../utils/v2Reply');

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
  async execute(message, args, client) {
    const expr = args.join(' ');
    const embed = evaluateMath(expr);
    return message.reply(opts(embed));
  },
  async slashExecute(interaction) {
    const expr = interaction.options.getString('expression', true);
    const embed = evaluateMath(expr);
    return interaction.reply(opts(embed));
  },
};

function evaluateMath(expr) {
  try {
    const result = evaluate(expr);
    return responseBuilder.buildResult({ title: '🧮 Calculator', fields: [{ name: 'Input', value: `\`${expr}\``, inline: true },
        { name: 'Result', value: `\`${result}\``, inline: true },]});
  } catch (e) {
    return responseBuilder.buildResult({ description: `❌ Invalid expression: ${e.message}`});
  }
}
