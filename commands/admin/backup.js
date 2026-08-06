// src/commands/admin/backup.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'backup', category: 'admin', description: 'Backup server settings to a JSON file.', usage: '', cooldown: 10, ownerOnly: true,
  async execute(message) {
    const g = message.guild;
    const data = {
      name: g.name, id: g.id, memberCount: g.memberCount,
      roles: g.roles.cache.filter(r => !r.managed).map(r => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, position: r.position })),
      channels: g.channels.cache.filter(c => !c.isThread()).map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
    };
    const buf = Buffer.from(JSON.stringify(data, null, 2));
    const att = new AttachmentBuilder(buf, { name: `backup-${g.id}-${Date.now()}.json` });
    return message.reply({ files: [att], embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Backup created — ${data.roles.length} roles, ${data.channels.length} channels.`)] });
  },
};
