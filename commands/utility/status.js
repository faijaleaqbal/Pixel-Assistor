// src/commands/utility/status.js
// Owner only. Set bot presence status.

const responseBuilder = require('../../utils/responseBuilder');

module.exports = {
  name: 'status',
  category: 'utility',
  description: 'Set bot status (owner only). Usage: status <online/idle/dnd/invisible> [text]',
  usage: '<online|idle|dnd|invisible> [custom text]',
  cooldown: 3,
  ownerOnly: true,
  async execute(message, args, client) {

    const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
    const currentStatus = message.client.user.presence.status;

    if (!args[0]) {
      const embed = responseBuilder.buildResult({ title: '🟢 Current Status', fields: [{ name: 'Status', value: currentStatus, inline: true },
          { name: 'Activity', value: message.client.user.presence.activities[0]?.name || 'None', inline: true },]});
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

    const embed = responseBuilder.buildResult({ title: '✅ Status Updated', fields: [{ name: 'Status', value: statusInput, inline: true },
        { name: 'Custom Text', value: customText || 'None', inline: true },]});

    return message.reply({ embeds: [embed] });
  },
};
