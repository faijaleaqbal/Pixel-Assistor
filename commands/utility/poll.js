// src/commands/utility/poll.js
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'poll',
  category: 'utility',
  description: 'Create a poll with reactions.',
  usage: '<question>',
  cooldown: 5,
  args: true,
  async execute(message, args, client) {
    const question = args.join(' ');
    if (!question) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a question.'})));
    const embed = responseBuilder.buildResult({ title: `\uD83D\uDCCA ${question}`});
    const sent = await message.reply(opts(embed));
    for (const e of ['\uD83D\uDC4D', '\uD83D\uDC4E', '\uD83D\uDE36']) await sent.react(e);
  },
};
