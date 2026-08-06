// src/commands/utility/poll.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'poll',
  category: 'utility',
  description: 'Create a poll with reactions.',
  usage: '<question>',
  cooldown: 5,
  args: true,
  async execute(message, args) {
    const question = args.join(' ');
    if (!question) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Provide a question.')] });
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`\uD83D\uDCCA ${question}`)
      .setFooter({ text: `Poll by ${message.author.tag}` })
      .setTimestamp();
    const sent = await message.reply({ embeds: [embed] });
    for (const e of ['\uD83D\uDC4D', '\uD83D\uDC4E', '\uD83D\uDE36']) await sent.react(e);
  },
};
