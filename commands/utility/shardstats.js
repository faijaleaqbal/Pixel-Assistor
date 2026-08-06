// src/commands/utility/shardstats.js
// Show shard information if the bot is sharded.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'shardstats',
  category: 'utility',
  description: 'Show shard statistics',
  usage: '',
  aliases: ['shards'],
  cooldown: 5,
  async execute(message) {
    const client = message.client;

    if (!client.shard) {
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('🔌 Shard Stats')
        .setDescription('This bot is **not sharded**.')
        .setTimestamp()] });
    }

    const guildCounts = await client.shard.fetchClientValues('guilds.cache.size');
    const totalGuilds = guildCounts.reduce((a, b) => a + b, 0);

    const fields = [];
    for (let i = 0; i < guildCounts.length; i++) {
      fields.push({ name: `Shard ${i}`, value: `${guildCounts[i]} servers`, inline: true });
    }

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle('🔌 Shard Stats')
      .addFields(
        { name: 'Total Shards', value: String(client.shard.count), inline: true },
        { name: 'Current Shard', value: String(client.shard.ids[0]), inline: true },
        { name: 'Total Servers', value: String(totalGuilds), inline: true },
        ...fields,
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
