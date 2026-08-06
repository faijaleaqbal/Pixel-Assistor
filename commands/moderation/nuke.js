// src/commands/moderation/nuke.js
// Clone current channel with same settings, delete original.

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'nuke',
  category: 'moderation',
  aliases: ['nk'],
  description: 'Nuke the current channel (clone + delete original).',
  usage: '',
  cooldown: 5,
  permissions: ['ManageChannels'],
  async execute(message) {
    const old = message.channel;
    try {
      const created = await old.clone();
      await old.delete().catch(() => {});
      return created.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('💥 Channel nuked.')] }).catch(() => {});
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Nuke failed: **${e.message}**`)] }).catch(() => {});
    }
  },
};
