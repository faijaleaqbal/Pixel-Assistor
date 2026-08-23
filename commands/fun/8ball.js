// src/commands/fun/8ball.js
const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const RESPONSES = ['It is certain.', 'Without a doubt.', 'Yes definitely.', 'Reply hazy, try again.', 'Ask again later.', 'Cannot predict now.', "Don't count on it.", 'My reply is no.', 'Very doubtful.', 'My sources say no.', 'Most likely.', 'Outlook good.', 'Better not tell you now.', 'Concentrate and ask again.'];

module.exports = {
  name: '8ball', category: 'fun', description: 'Ask the magic 8-ball a question.', usage: '<question>', cooldown: 3, args: true,
  async execute(message, args, client) {
    const q = args.join(' ');
    if (!q) return message.reply(opts(responseBuilder.buildResult({ description: 'Ask a question!'})));
    // Discord embed field value limit is 1024 chars; title is 256. Truncate the
    // question to avoid an API 400 on long input.
    const trimmedQ = q.length > 1000 ? q.slice(0, 1000) + '…' : q;
    const ans = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
    return message.reply(opts(responseBuilder.buildResult({ title: '🎱 Magic 8-Ball', fields: [{ name: 'Question', value: trimmedQ, inline: false },
      { name: 'Answer', value: ans, inline: false }]})));
  },
};
