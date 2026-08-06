// src/commands/moderation/unban.js

const { EmbedBuilder } = require('discord.js');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'unban',
  category: 'moderation',
  aliases: ['ub'],
  description: 'Unban a user by @mention or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  permissions: ['BanMembers'],
  args: true,
  async execute(message, args) {
    // Resolve via mention or raw ID (Bans.fetch will reject if not banned).
    const target = await resolveUserArg(message, args[0]);
    if (!target) return;
    const reason = args.slice(1).filter(a => !/^<@!?\d+>$/.test(a) && !/^\d{17,19}$/.test(a)).join(' ') || 'No reason provided';
    try {
      await message.guild.bans.remove(target.id, reason);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Unbanned ${target.tag} — ${reason}`)] });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed: ${e.message}`)] });
    }
  },
};
