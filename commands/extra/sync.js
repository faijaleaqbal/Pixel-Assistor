const responseBuilder = require('../../utils/responseBuilder');
// src/commands/extra/sync.js
// Sync application (slash) commands. Owner-only.
//   ?sync        -> guild-only slash commands for the dev guild
//   ?sync global -> global slash commands (takes up to 1h to propagate)
//   ?sync clear  -> remove all slash commands from the dev guild

const { REST, Routes } = require('discord.js');
const config = require('../../utils/config');
const { isOwner } = require('../../utils/perms');
const { all } = require('../../utils/commandMeta');

module.exports = {
  name: 'sync',
  category: 'extra',
  aliases: ['sy'],
  description: 'Sync slash commands to the dev guild, globally, or clear them.',
  usage: '[global|clear]',
  cooldown: 5,
  ownerOnly: true,
  async execute(message, args, client) {
    if (!isOwner(message.author.id)) return;
    if (!config.clientId) return message.reply('`CLIENT_ID` missing in .env.');
    const m = await message.reply('⏳ Syncing…');

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
      // Build slash command payloads from commands that opt-in via `slash: true`.
      const payload = all()
        .filter((c) => c.slash)
        .map((c) => ({
          name: c.name,
          description: (c.description || c.name).slice(0, 100),
          options: c.slashOptions || [],
        }));

      if (args[0] === 'global') {
        // Guard: if no commands opted into slash mode, warn instead of silently
        // wiping existing global slash commands via an empty-body PUT.
        if (!payload.length) {
          return m.edit({ embeds: [err('No commands have `slash: true` enabled — nothing to sync. Mark commands with `slash: true` first to avoid wiping existing global slash commands.')] });
        }
        await rest.put(Routes.applicationCommands(config.clientId), { body: payload });
        return m.edit({ embeds: [ok(`Synced ${payload.length} commands globally.`)] });
      }
      if (args[0] === 'clear') {
        if (config.guildId) {
          await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: [] });
        }
        await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
        return m.edit({ embeds: [ok('Cleared all slash commands.')] });
      }
      if (!config.guildId) return m.edit('`GUILD_ID` missing in .env — needed for guild sync. Use `?sync global` instead.');
      if (!payload.length) {
        return m.edit({ embeds: [err('No commands have `slash: true` enabled — nothing to sync.')] });
      }
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: payload });
      return m.edit({ embeds: [ok(`Synced ${payload.length} commands to guild \`${config.guildId}\`.`)] });
    } catch (e) {
      return m.edit({ embeds: [err(e.message)] });
    }
  },
};

function ok(text) { return responseBuilder.buildResult({ description: text}); }
function err(text) { return responseBuilder.buildResult({ description: 'Sync failed: ' + text}); }
