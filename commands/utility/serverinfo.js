// src/commands/utility/serverinfo.js

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'serverinfo',
  category: 'utility',
  description: 'Show info about the current server.',
  usage: '',
  aliases: ['si'],
  cooldown: 3,
  async execute(message) {
    const g = message.guild;
    try { await g.fetch(); } catch { /* ignore */ }

    const verLevels = {
      0: 'None',
      1: 'Low (Verified Email)',
      2: 'Medium (5 min on Discord)',
      3: 'High (10 min on Server)',
      4: 'Very High (Verified Phone)',
    };
    const verText = verLevels[g.verificationLevel] || String(g.verificationLevel ?? 'None');

    const e = responseBuilder.buildResult({ title: `🏠 ${g.name}`, fields: [{ name: 'ID', value: `\`${g.id}\``, inline: true },
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Members', value: String(g.memberCount || 0), inline: true },
        { name: 'Channels', value: String(g.channels?.cache?.size || 0), inline: true },
        { name: 'Roles', value: String(g.roles?.cache?.size || 0), inline: true },
        { name: 'Boosts', value: `Level ${g.premiumTier || 0} (${g.premiumSubscriptionCount || 0} boosts)`, inline: true },
        { name: 'Verification', value: verText, inline: true },], thumbnail: g.iconURL({ size: 512 })});
    return message.reply(opts(e, { allowedMentions: { parse: [] } }));
  },
};

