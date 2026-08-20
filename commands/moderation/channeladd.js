const responseBuilder = require('../../utils/responseBuilder');
// src/commands/moderation/channeladd.js
// Add a channel (text or voice). Usage: channeladd <text|voice> <name>

const { ChannelType } = require('discord.js');

module.exports = {
  name: 'channeladd',
  category: 'moderation',
  aliases: ['cadd'],
  description: 'Create a new channel. Usage: channeladd <text|voice> <name>',
  usage: '<text|voice> <name>',
  cooldown: 3,
  permissions: ['ManageChannels'],
  args: true,
  async execute(message, args, client) {
    const type = (args[0] || '').toLowerCase() === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
    const name = args.slice(1).join('-').toLowerCase().replace(/\s+/g, '-');
    if (!name) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a channel name.'})] });
    try {
      const ch = await message.guild.channels.create({ name, type });
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Created ${type === ChannelType.GuildVoice ? 'voice' : 'text'} channel <#${ch.id}>.`})] });
    } catch (e) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `Failed to create channel: ${e.message}`})] });
    }
  },
};
