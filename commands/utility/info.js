// src/commands/utility/info.js
// Bot info — Components V2 container via the shared v2Reply helper.

const { opts, buildContainer } = require('../../utils/v2Reply');
const { getPrefix } = require('../../utils/prefixCache');

module.exports = {
  name: 'info',
  category: 'utility',
  description: 'Show bot info using Components V2',
  usage: '',
  aliases: [],
  cooldown: 5,
  slash: true,
  slashOptions: [],

  async execute(message) {
    const prefix = await getPrefix(message.guild?.id);
    await message.reply(payload(prefix));
  },

  async slashExecute(interaction) {
    const prefix = await getPrefix(interaction.guildId);
    await interaction.reply(payload(prefix));
  },
};

function payload(prefix = '?') {
  return opts(buildContainer({
    title: 'Pixel Assistant',
    emoji: '🤖',
    color: '#5865F2',
    description: 'A production-ready Discord bot with crypto tracking, moderation, games and utilities.',
    fields: [
      { name: 'Prefix', value: `\`${prefix}\`` },
      { name: 'Slash', value: '`/help` for all commands' },
      { name: 'Uptime', value: '24/7 hosted' },
    ],
  }));
}
