// src/commands/utility/firstmsg.js
// Fetch and display the first message in the current channel.

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'firstmsg',
  category: 'utility',
  description: 'Show the first message in this channel',
  usage: '',
  aliases: ['first-message'],
  cooldown: 5,
  async execute(message) {
    let messages;
    try {
      messages = await message.channel.messages.fetch({ limit: 1, after: '0' });
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to fetch messages: **${e.message}**`})));
    }
    const first = messages.first();
    if (!first) return message.reply(opts(buildContainer({ description: 'Could not find the first message.' })));

    const content = first.content?.slice(0, 1024) || '*No text content*';
    const jumpUrl = first.url || `https://discord.com/channels/${first.guildId || message.guild?.id || '@me'}/${first.channelId}/${first.id}`;

    const embed = responseBuilder.buildResult({
      title: '📜 First Message',
      fields: [
        { name: 'Author', value: `${first.author.tag} (${first.author.id})`, inline: true },
        { name: 'Date', value: `<t:${Math.floor(first.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Content', value: content, inline: false },
        { name: 'Jump', value: `[Jump to message](${jumpUrl})`, inline: false },
      ],
    });

    return message.reply(opts(embed));
  },
};
