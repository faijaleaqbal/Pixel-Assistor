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
    await g.fetch();
    const e = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(`🏠 ${g.name}`)
      .setThumbnail(g.iconURL({ size: 512 }))
      .addFields(
        { name: 'ID', value: g.id, inline: true },
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Members', value: String(g.memberCount), inline: true },
        { name: 'Channels', value: String(g.channels.cache.size), inline: true },
        { name: 'Roles', value: String(g.roles.cache.size), inline: true },
        { name: 'Boosts', value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount})`, inline: true },
        { name: 'Verification', value: g.verificationLevel, inline: true },
      )
      .setTimestamp();
    return message.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};
