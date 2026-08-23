// src/commands/utility/invite.js
// Show the bot's invite link.

const responseBuilder = require('../../utils/responseBuilder');
const config = require('../../utils/config');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'invite',
  aliases: ['inv'],
  category: 'utility',
  description: 'Get the bot invite link',
  usage: '',
  cooldown: 5,
  async execute(message) {
    const clientId = config.clientId;
    if (!clientId) return message.reply(opts(buildContainer({ description: 'Bot client ID is not configured.' })));

    const link = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

    const embed = responseBuilder.buildResult({ title: '🔗 Invite Me', description: `[Click here to invite me](${link})`});

    return message.reply(opts(embed));
  },
};
