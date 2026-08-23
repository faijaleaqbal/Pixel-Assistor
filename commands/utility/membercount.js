// src/commands/utility/membercount.js
// Show server member breakdown.

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'membercount',
  category: 'utility',
  description: 'Show server member count breakdown',
  usage: '',
  aliases: ['mc'],
  cooldown: 3,
  async execute(message) {
    const guild = message.guild;
    try {
      await guild.members.fetch();
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed to fetch members: **${e.message}**`})));
    }
    const total = guild.memberCount;
    const humans = guild.members.cache.filter((m) => !m.user.bot).size;
    const bots = guild.members.cache.filter((m) => m.user.bot).size;
    const online = guild.members.cache.filter((m) => m.presence?.status === 'online').size;

    const embed = responseBuilder.buildResult({ title: `👥 ${guild.name} Members`, fields: [{ name: 'Total', value: String(total), inline: true },
        { name: 'Humans', value: String(humans), inline: true },
        { name: 'Bots', value: String(bots), inline: true },
        { name: 'Online', value: String(online), inline: true },]});

    return message.reply(opts(embed));
  },
};
