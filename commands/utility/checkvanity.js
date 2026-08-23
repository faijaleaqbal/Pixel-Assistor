// src/commands/utility/checkvanity.js
// Check if a Discord vanity URL is available.

const responseBuilder = require('../../utils/responseBuilder');
const { request } = require('../../utils/http');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'checkvanity',
  category: 'utility',
  description: 'Check if a Discord vanity URL is available. Usage: checkvanity <name>',
  usage: '<name>',
  cooldown: 5,
  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return message.reply(opts(buildContainer({ description: 'Please provide a vanity name.' })));

    try {
      const encoded = encodeURIComponent(name);
      const res = await request(`https://discord.gg/${encoded}`, {
        method: 'GET',
        redirect: 'manual',
        timeout: 5000,
        validateStatus: false,
        label: 'Discord Vanity Check',
      });
      const taken = res.status !== 404;

      const embed = responseBuilder.buildResult({ title: '🔍 Vanity URL Check', fields: [{ name: 'Name', value: `discord.gg/${name}`, inline: true },
          { name: 'Status', value: taken ? '❌ Taken' : '✅ Available', inline: true },]});

      return message.reply(opts(embed));
    } catch {
      return message.reply(opts(responseBuilder.buildResult({ title: '❌ Error', description: 'Failed to check vanity URL. Please try again.'})));
    }
  },
};
