// src/commands/moderation/unbanall.js

const { EmbedBuilder } = require('discord.js');

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
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to fetch bans: **${e.message}**`)] });
    }
    if (!bans.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No banned users found.')] });
    let count = 0;
    for (const [id] of bans) {
      try {
        await message.guild.bans.remove(id);
        count++;
      } catch { /* skip */ }
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Unbanned ${count}/${bans.size} user(s).`)] });
  },
};
