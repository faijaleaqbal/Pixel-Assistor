// src/commands/moderation/owner.js
// Configure server co-owner roles.
// SECURITY: Restricted strictly to the Guild Owner or Bot Owners.
// Usage: ?owner add <@role> | ?owner remove <@role> | ?owner list | ?owner clear

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const { isOwner } = require('../../utils/perms');

module.exports = {
  name: 'owner',
  category: 'moderation',
  description: 'Manage server co-owner roles. Only the Server Owner or Bot Owners can use this command.',
  usage: '<add|remove|list|clear> [@role]',
  cooldown: 3,
  permissions: ['Administrator'],

  async execute(message, args) {
    // Strict Owner Security Guard: Guild Owner or Bot Owner only!
    const isGuildOwner = message.guild.ownerId === message.author.id;
    const isBotOwner = isOwner(message.author.id);

    if (!isGuildOwner && !isBotOwner) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Only the **Server Owner** can configure server co-owner roles.')],
      });
    }

    const db = getDb();
    const gCfg = (await db.guildConfig.get(message.guild.id)) || {};
    const sub = (args[0] || '').toLowerCase();
    const ownerRoles = gCfg.ownerRoles || [];

    if (!sub || sub === 'list') {
      if (!ownerRoles.length) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription('No owner roles are configured.')] });
      }
      const roles = ownerRoles.map((id) => {
        const r = message.guild.roles.cache.get(id);
        return r ? `${r} (\`${id}\`)` : `\`${id}\` (deleted)`;
      });
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👑 Owner Roles').setDescription(roles.join('\n'))],
      });
    }

    if (sub === 'add') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role or provide a role ID.')] });
      }
      if (ownerRoles.includes(role.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(`${role} is already an owner role.`)] });
      }
      ownerRoles.push(role.id);
      await db.guildConfig.set(message.guild.id, { ownerRoles });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Added ${role} to owner roles.`)] });
    }

    if (sub === 'remove') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Mention a role or provide a role ID.')] });
      }
      const idx = ownerRoles.indexOf(role.id);
      if (idx === -1) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`${role} is not in the owner roles list.`)] });
      }
      ownerRoles.splice(idx, 1);
      await db.guildConfig.set(message.guild.id, { ownerRoles });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed ${role} from owner roles.`)] });
    }

    if (sub === 'clear') {
      await db.guildConfig.set(message.guild.id, { ownerRoles: [] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Cleared all owner roles.')] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Usage: `?owner <add|remove|list|clear> [@role]`')] });
  },
};
