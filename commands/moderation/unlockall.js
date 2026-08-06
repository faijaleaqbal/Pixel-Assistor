// src/commands/moderation/unlockall.js

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'unlockall',
  category: 'moderation',
  description: 'Unlock all locked text channels (allow SendMessages for @everyone).',
  usage: '',
  cooldown: 5,
  permissions: ['ManageChannels'],
  async execute(message) {
    const everyone = message.guild.roles.everyone;
    const channels = message.guild.channels.cache.filter(c => {
      if (!c.isTextBased() || c.isThread() || !c.manageable) return false;
      const ow = c.permissionOverwrites.cache.get(everyone.id);
      return ow && ow.deny.has(PermissionFlagsBits.SendMessages);
    });
    if (!channels.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No locked text channels found.')] });
    let count = 0;
    for (const ch of channels.values()) {
      try {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: true });
        count++;
      } catch { /* skip */ }
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🔓 Unlocked ${count} text channel(s).`)] });
  },
};
