// src/commands/utility/ping.js
// Check bot latency — WebSocket heartbeat + round-trip API ping.

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  aliases: ['p', 'latency'],
  category: 'utility',
  description: "Check the bot's latency and response time.",
  usage: '',
  cooldown: 3,
  slash: true,
  async execute(message) {
    const wsLatency = Math.max(0, Math.round(message.client.ws.ping));
    const sent = await message.reply('🏓 Pinging...');
    const apiLatency = sent.createdTimestamp - message.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'WebSocket Heartbeat', value: `\`${wsLatency}ms\``, inline: true },
        { name: 'API Roundtrip', value: `\`${apiLatency}ms\``, inline: true },
      )
      .setTimestamp();

    return sent.edit({ content: null, embeds: [embed] });
  },
  async slashExecute(interaction, client) {
    const wsLatency = Math.max(0, Math.round(client.ws.ping));
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'WebSocket Heartbeat', value: `\`${wsLatency}ms\``, inline: true },
        { name: 'API Roundtrip', value: `\`${apiLatency}ms\``, inline: true },
      )
      .setTimestamp();

    return interaction.editReply({ content: null, embeds: [embed] });
  },
};

