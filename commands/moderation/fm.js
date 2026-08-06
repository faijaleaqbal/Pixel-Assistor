// src/commands/moderation/fm.js
// Jump link to the first message in the channel.

const { EmbedBuilder } = require('discord.js');

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
    if (!first) return message.reply('Could not fetch the first message.');
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`📎 [First message](${first.url})`)] });
  },
};
