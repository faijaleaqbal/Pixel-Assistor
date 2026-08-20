// src/commands/moderation/nuke.js
// Clone current channel with same settings, delete original.

const { EmbedBuilder } = require('discord.js');
const { checkBotPermissions } = require('../../utils/perms');

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

    // Check bot permissions
    const botCheck = checkBotPermissions(message, ['ManageChannels']);
    if (!botCheck.ok) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ I need the **ManageChannels** permission in this channel to nuke it.')],
      });
    }

    // Guard essential community channels
    if (message.guild.rulesChannelId === old.id || message.guild.publicUpdatesChannelId === old.id || message.guild.systemChannelId === old.id) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Cannot nuke server system, rules, or community updates channels.')],
      });
    }

    if (!old.deletable) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ This channel is not deletable by the bot.')],
      });
    }

    try {
      const pos = old.rawPosition;
      const created = await old.clone({ position: pos });
      await old.delete(`Nuked by ${message.author.tag}`);
      return created.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`💥 Channel nuked by ${message.author}.`)] }).catch(() => {});
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`❌ Nuke failed: **${e.message}**`)] }).catch(() => {});
    }
  },
};
