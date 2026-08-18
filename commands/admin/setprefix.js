// src/commands/admin/setprefix.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');
const { setPrefix } = require('../../utils/prefixCache');
const { hasPermission, isOwner } = require('../../utils/perms');

module.exports = {
  name: 'setprefix',
  category: 'admin',
  aliases: ['prefix'],
  description: 'Change the bot prefix for this server.',
  usage: '<new-prefix|default|reset>',
  cooldown: 5,
  permissions: ['Administrator'],
  args: true,
  async execute(message, args) {
    if (!hasPermission(message.member, 'Administrator') && !isOwner(message.author.id) && message.guild.ownerId !== message.author.id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('You need the `Administrator` permission to change the server prefix.')] });
    }

    const input = args[0];
    const isReset = input.toLowerCase() === 'default' || input.toLowerCase() === 'reset';
    const targetPrefix = isReset ? (config.prefix || '?') : input;

    if (!isReset && (targetPrefix.length < 1 || targetPrefix.length > 5)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Prefix must be between 1 and 5 characters.')] });
    }

    try {
      const db = getDb();
      await db.guildConfig.set(message.guild.id, { prefix: isReset ? null : targetPrefix });
      setPrefix(message.guild.id, targetPrefix);

      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Prefix Updated')
          .setDescription(`The server prefix is now set to \`${targetPrefix}\`.\nExample: \`${targetPrefix}help\``)
          .setTimestamp()]
      });
    } catch (e) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`Failed to update prefix: ${e.message}`)] });
    }
  },
};

