// src/commands/utility/serverinfo.js

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'serverinfo',
  category: 'utility',
  description: 'Show info about the current server.',
  usage: '',
  aliases: ['si'],
  cooldown: 3,
  async execute(message) {
    const g = message.guild;
    try { await g.fetch(); } catch { /* ignore */ }

    const verLevels = {
      0: 'None',
      1: 'Low (Verified Email)',
      2: 'Medium (5 min on Discord)',
      3: 'High (10 min on Server)',
      4: 'Very High (Verified Phone)',
    };
    const verText = verLevels[g.verificationLevel] || String(g.verificationLevel ?? 'None');

    const e = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(`🏠 ${g.name}`)
      .setThumbnail(g.iconURL({ size: 512 }))
      .addFields(
        { name: 'ID', value: `\`${g.id}\``, inline: true },
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Members', value: String(g.memberCount || 0), inline: true },
        { name: 'Channels', value: String(g.channels?.cache?.size || 0), inline: true },
        { name: 'Roles', value: String(g.roles?.cache?.size || 0), inline: true },
        { name: 'Boosts', value: `Level ${g.premiumTier || 0} (${g.premiumSubscriptionCount || 0} boosts)`, inline: true },
        { name: 'Verification', value: verText, inline: true },
      )
      .setTimestamp();
    return message.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};

