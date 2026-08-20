const responseBuilder = require('../../utils/responseBuilder');
// src/commands/moderation/unhideall.js

const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'unhideall',
  category: 'moderation',
  description: 'Unhide all hidden text channels for @everyone.',
  usage: '',
  cooldown: 5,
  permissions: ['ManageChannels'],
  async execute(message) {
    const everyone = message.guild.roles.everyone;
    const channels = message.guild.channels.cache.filter(c => {
      if (!c.isTextBased() || c.isThread() || !c.manageable) return false;
      const ow = c.permissionOverwrites.cache.get(everyone.id);
      return ow && ow.deny.has(PermissionFlagsBits.ViewChannel);
    });
    if (!channels.size) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'No hidden text channels found.'})] });
    let count = 0;
    for (const ch of channels.values()) {
      try {
        await ch.permissionOverwrites.edit(everyone, { ViewChannel: true });
        count++;
      } catch { /* skip */ }
    }
    return message.reply({ embeds: [responseBuilder.buildResult({ description: `👁️ Unhid ${count} text channel(s).`})] });
  },
};
