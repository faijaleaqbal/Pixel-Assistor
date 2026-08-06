// src/commands/moderation/hideall.js

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'hideall',
  category: 'moderation',
  description: 'Hide all text channels from @everyone.',
  usage: '',
  cooldown: 5,
  permissions: ['ManageChannels'],
  async execute(message) {
    const channels = message.guild.channels.cache.filter(c => c.isTextBased() && !c.isThread() && c.manageable);
    if (!channels.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No text channels found.')] });
    let count = 0;
    for (const ch of channels.values()) {
      try {
        await ch.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
        count++;
      } catch { /* skip */ }
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🙈 Hidden ${count} text channel(s).`)] });
  },
};
