// src/events/guildMemberRemove.js
// Stores persisted roles + sends leave message.

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../utils/db');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    try {
      const db = getDb();

      // Persist-role save
      const saved = await db.persistRole.get(member.id, member.guild.id);
      if (saved && saved.length) {
        const current = member.roles.cache.filter(r => !r.managed && r.id !== member.guild.id).map(r => r.id);
        const next = saved.filter(id => current.includes(id));
        if (next.length) await db.persistRole.set(member.id, member.guild.id, next);
        else await db.persistRole.remove(member.id, member.guild.id);
      }

      // Leave message
      const gCfg = await db.guildConfig.get(member.guild.id);
      if (gCfg && gCfg.leaveChannel && gCfg.leaveMsg) {
        const ch = member.guild.channels.cache.get(gCfg.leaveChannel);
        if (ch) {
          const text = gCfg.leaveMsg
            .replace(/{user}/g, member.user.tag)
            .replace(/{server}/g, member.guild.name);
          const embed = new EmbedBuilder().setColor(0xED4245).setTitle('Goodbye!').setDescription(text).setThumbnail(member.user.displayAvatarURL({ size: 128 })).setTimestamp();
          await ch.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  },
};
