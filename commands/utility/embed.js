// src/commands/utility/embed.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'embed',
  category: 'utility',
  description: 'Send a custom embed. Usage: embed <title> | <description> | [#color]',
  usage: '<title> | <description> | [#color]',
  cooldown: 5,
  args: true,
  async execute(message, args) {
    const raw = args.join(' ');
    if (!raw.includes('|'))
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
        'Use `|` to separate fields.\nExample: `?embed Hello | World | #ff0000`'
      )] });

    const parts = raw.split('|').map(s => s.trim());
    const title = parts[0] || 'Untitled';
    const desc = parts[1] || '';
    let color = 0x5865F2;
    if (parts[2] && /^#[0-9a-f]{6}$/i.test(parts[2])) color = parseInt(parts[2].replace('#', ''), 16);

    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc)
      .setFooter({ text: message.author.tag }).setTimestamp();

    try { await message.delete(); } catch {}
    return message.channel.send({ embeds: [embed] });
  },
};
