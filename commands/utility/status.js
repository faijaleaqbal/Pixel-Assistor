// src/commands/utility/status.js
// Owner only. Set bot presence status.

const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');

module.exports = {
  name: 'status',
  category: 'utility',
  description: 'Set bot status (owner only). Usage: status <online/idle/dnd/invisible> [text]',
  usage: '<online|idle|dnd|invisible> [custom text]',
  cooldown: 3,
  ownerOnly: true,
  async execute(message, args) {

    const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
    const currentStatus = message.client.user.presence.status;

    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🟢 Current Status')
        .addFields(
          { name: 'Status', value: currentStatus, inline: true },
          { name: 'Activity', value: message.client.user.presence.activities[0]?.name || 'None', inline: true },
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    const statusInput = args[0].toLowerCase();
    if (!validStatuses.includes(statusInput)) {
      return message.reply(`Invalid status. Choose from: ${validStatuses.join(', ')}`);
    }

    const customText = args.slice(1).join(' ');
    const presence = { status: statusInput };
    if (customText) {
      presence.activities = [{ name: customText, type: 0 }];
    }

    await message.client.user.setPresence(presence);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Status Updated')
      .addFields(
        { name: 'Status', value: statusInput, inline: true },
        { name: 'Custom Text', value: customText || 'None', inline: true },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
