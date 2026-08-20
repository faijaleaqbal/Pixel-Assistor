// src/commands/utility/poll.js
const responseBuilder = require('../../utils/responseBuilder');

module.exports = {
  name: 'poll',
  category: 'utility',
  description: 'Create a poll with reactions.',
  usage: '<question>',
  cooldown: 5,
  args: true,
  async execute(message, args, client) {
    const question = args.join(' ');
    if (!question) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a question.'})] });
    const embed = responseBuilder.buildResult({ title: `\uD83D\uDCCA ${question}`});
    const sent = await message.reply({ embeds: [embed] });
    for (const e of ['\uD83D\uDC4D', '\uD83D\uDC4E', '\uD83D\uDE36']) await sent.react(e);
  },
};
