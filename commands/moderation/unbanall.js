// src/commands/moderation/unbanall.js

const responseBuilder = require('../../utils/responseBuilder');

module.exports = {
  name: 'unbanall',
  category: 'moderation',
  description: 'Unban all banned users in the guild.',
  usage: '',
  cooldown: 5,
  permissions: ['BanMembers'],
  async execute(message) {
    let bans;
    try {
      bans = await message.guild.bans.fetch();
    } catch (e) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `Failed to fetch bans: **${e.message}**`})] });
    }
    if (!bans.size) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'No banned users found.'})] });
    let count = 0;
    for (const [id] of bans) {
      try {
        await message.guild.bans.remove(id);
        count++;
      } catch { /* skip */ }
    }
    return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Unbanned ${count}/${bans.size} user(s).`})] });
  },
};
