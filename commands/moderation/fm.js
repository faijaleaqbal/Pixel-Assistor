// src/commands/moderation/fm.js
// Jump link to the first message in the channel.

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'fm',
  category: 'moderation',
  description: 'Get a jump link to the first message in the channel.',
  usage: '',
  cooldown: 3,
  permissions: ['ReadMessageHistory'],
  async execute(message) {
    const fetched = await message.channel.messages.fetch({ limit: 1, after: '0' });
    const first = fetched.first();
    if (!first) return message.reply(opts(buildContainer({ description: 'Could not fetch the first message.' })));
    return message.reply(opts(responseBuilder.buildResult({ description: `📎 [First message](${first.url})`})));
  },
};
