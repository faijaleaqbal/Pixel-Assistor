// src/commands/utility/ping.js
// Check bot latency — WebSocket heartbeat + round-trip API ping.

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  aliases: ['p', 'latency'],
  category: 'utility',
  description: 'Check the bot\'s latency',
  usage: '',
  cooldown: 3,
  async execute(message) {
    const wsLatency = Math.round(message.client.ws.ping);
    const sent = await message.reply('🏓 Pinging...');
    const apiLatency = sent.createdTimestamp - message.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'WebSocket', value: `${wsLatency}ms`, inline: true },
        { name: 'API', value: `${apiLatency}ms`, inline: true },
      )
      .setTimestamp();

    return sent.edit({ content: null, embeds: [embed] });
  },
};
