// src/commands/utility/checkvanity.js
// Check if a Discord vanity URL is available.

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'checkvanity',
  category: 'utility',
  description: 'Check if a Discord vanity URL is available. Usage: checkvanity <name>',
  usage: '<name>',
  cooldown: 5,
  async execute(message, args) {
    const name = args.join(' ').trim();
    if (!name) return message.reply('Please provide a vanity name.');

    try {
      const encoded = encodeURIComponent(name);
      const res = await fetch(`https://discord.gg/${encoded}`, { redirect: 'manual' });
      const taken = res.status !== 404;

      const embed = new EmbedBuilder()
        .setColor(taken ? 0xED4245 : 0x57F287)
        .setTitle('🔍 Vanity URL Check')
        .addFields(
          { name: 'Name', value: `discord.gg/${name}`, inline: true },
          { name: 'Status', value: taken ? '❌ Taken' : '✅ Available', inline: true },
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Error')
        .setDescription('Failed to check vanity URL.')
        .setTimestamp()] });
    }
  },
};
