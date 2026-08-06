// src/commands/moderation/lockall.js

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'lockall',
  category: 'moderation',
  description: 'Lock all text channels (deny SendMessages for @everyone).',
  usage: '',
  cooldown: 5,
  permissions: ['ManageChannels'],
  async execute(message) {
    const everyone = message.guild.roles.everyone;
    const channels = message.guild.channels.cache.filter(c => {
      // ThreadChannel has no permissionOverwrites — skip threads. Also skip
      // channels the bot can't manage (e.g. category, voice in some setups).
      if (!c.isTextBased() || c.isThread() || !c.manageable) return false;
      const ow = c.permissionOverwrites.cache.get(everyone.id);
      return !ow || !ow.deny.has(PermissionFlagsBits.SendMessages);
    });
    if (!channels.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('All text channels are already locked.')] });
    let count = 0;
    for (const ch of channels.values()) {
      try {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: false });
        count++;
      } catch { /* skip */ }
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`🔒 Locked ${count} text channel(s).`)] });
  },
};
