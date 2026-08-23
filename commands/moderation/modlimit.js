// src/commands/moderation/modlimit.js

const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'modlimit',
  aliases: ['ml'],
  category: 'moderation',
  description: 'Manage mod command limits. Usage: modlimit set <number> | set admin <number> | set mod <number> | show | reset',
  usage: 'set <number> | set admin <number> | set mod <number> | show | reset',
  cooldown: 3,
  permissions: ['Administrator'],
  async execute(message, args, client) {
    const db = getDb();
    const action = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    // Show
    if (action === 'show') {
      const cfg = await db.guildConfig.get(guildId);
      return message.reply(opts(responseBuilder.buildResult({ title: 'Mod Limits', fields: [{ name: 'Default Limit', value: String(cfg?.modLimit || 'Not set'), inline: true },
          { name: 'Admin Limit', value: String(cfg?.adminModLimit || 'Not set'), inline: true },
          { name: 'Mod Limit', value: String(cfg?.modModLimit || 'Not set'), inline: true }]})));
    }

    // Reset
    if (action === 'reset') {
      await db.guildConfig.set(guildId, { modLimit: null, adminModLimit: null, modModLimit: null });
      return message.reply(opts(responseBuilder.buildResult({ description: '✅ Mod limits reset.'})));
    }

    // Set
    if (action === 'set') {
      const sub = args[1]?.toLowerCase();
      const num = parseInt(args[sub === 'admin' || sub === 'mod' ? 2 : 1]);
      if (Number.isNaN(num) || num < 0) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a valid number.'})));
      if (sub === 'admin') {
        await db.guildConfig.set(guildId, { adminModLimit: num });
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Admin mod limit set to ${num}.`})));
      }
      if (sub === 'mod') {
        await db.guildConfig.set(guildId, { modModLimit: num });
        return message.reply(opts(responseBuilder.buildResult({ description: `✅ Mod mod limit set to ${num}.`})));
      }
      await db.guildConfig.set(guildId, { modLimit: num });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Default mod limit set to ${num}.`})));
    }

    return message.reply(opts(buildContainer({ description: 'Usage: `modlimit set <number> | set admin <number> | set mod <number> | show | reset`' })));
  },
};
