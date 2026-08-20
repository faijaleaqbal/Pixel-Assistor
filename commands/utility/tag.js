// src/commands/utility/tag.js
// Custom tag system. Usage: ?tag <name> | ?tag message <name> <content> | ?tag revoke <name>

const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');

module.exports = {
  name: 'tag',
  category: 'utility',
  description: 'Custom tag system. Create, view, and manage tags.',
  usage: '<name> | message <name> <content> | revoke <name> | settings <name> <content> | reset <name>',
  cooldown: 3,
  async execute(message, args, client) {
    const db = getDb();
    const sub = (args[0] || '').toLowerCase();

    // Coming soon subcommands
    const comingSoon = ['channel', 'enable', 'disable', 'ignore', 'reward'];
    if (comingSoon.includes(sub)) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Coming soon.'})] });
    }

    // ?tag message <name> <content>
    if (sub === 'message') {
      const name = (args[1] || '').toLowerCase();
      const content = args.slice(2).join(' ');
      if (!name) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a tag name.'})] });
      if (!content) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide tag content.'})] });
      await db.tag.set(message.guild.id, name, content, message.author.id);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Tag \`${name}\` created/updated.`})] });
    }

    // ?tag revoke <name>
    if (sub === 'revoke') {
      const name = (args[1] || '').toLowerCase();
      if (!name) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a tag name.'})] });
      const tag = await db.tag.get(message.guild.id, name);
      if (!tag) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Tag not found.'})] });
      if (tag.createdBy !== message.author.id && !message.member.permissions.has('Administrator')) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Only the tag creator or an admin can delete this tag.'})] });
      }
      await db.tag.delete(message.guild.id, name);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Tag \`${name}\` deleted.`})] });
    }

    // ?tag settings <name> <content> — alias for message
    if (sub === 'settings') {
      const name = (args[1] || '').toLowerCase();
      const content = args.slice(2).join(' ');
      if (!name) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a tag name.'})] });
      if (!content) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide tag content.'})] });
      await db.tag.set(message.guild.id, name, content, message.author.id);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Tag \`${name}\` updated.`})] });
    }

    // ?tag reset <name> — alias for revoke
    if (sub === 'reset') {
      const name = (args[1] || '').toLowerCase();
      if (!name) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a tag name.'})] });
      const tag = await db.tag.get(message.guild.id, name);
      if (!tag) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Tag not found.'})] });
      if (tag.createdBy !== message.author.id && !message.member.permissions.has('Administrator')) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Only the tag creator or an admin can delete this tag.'})] });
      }
      await db.tag.delete(message.guild.id, name);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Tag \`${name}\` deleted.`})] });
    }

    // ?tag <name> — view tag
    if (!sub) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a tag name.'})] });
    }

    const tag = await db.tag.get(message.guild.id, sub);
    if (!tag) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Tag not found. Use `?tag message <name> <content>` to create.'})] });
    }
    await db.tag.incrementUses(message.guild.id, sub);
    return message.reply({ content: tag.content, allowedMentions: { parse: [] } });
  },
};
