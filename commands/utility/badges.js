const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/badges.js
// Show a user's Discord badges.

const { UserFlagsBitField } = require('discord.js');
const { resolveUserArg } = require('../../utils/resolveUser');

const FLAG_NAMES = {
  [UserFlagsBitField.Flags.ActiveDeveloper]: '🟢 Active Developer',
  [UserFlagsBitField.Flags.BugHunterLevel1]: '🐛 Bug Hunter (Level 1)',
  [UserFlagsBitField.Flags.BugHunterLevel2]: '🐛 Bug Hunter (Level 2)',
  [UserFlagsBitField.Flags.HypeSquadOnlineHouse1]: '🏠 Hypesquad Bravery',
  [UserFlagsBitField.Flags.HypeSquadOnlineHouse2]: '🏠 Hypesquad Brilliance',
  [UserFlagsBitField.Flags.HypeSquadOnlineHouse3]: '🏠 Hypesquad Balance',
  [UserFlagsBitField.Flags.Hypesquad]: '🏟️ Hypesquad Events',
  [UserFlagsBitField.Flags.Partner]: '✅ Partner',
  [UserFlagsBitField.Flags.Staff]: '👤 Discord Staff',
  [UserFlagsBitField.Flags.VerifiedDeveloper]: '🤖 Verified Bot Developer',
  [UserFlagsBitField.Flags.CertifiedModerator]: '🛡️ Certified Moderator',
  [UserFlagsBitField.Flags.PremiumEarlySupporter]: '🚀 Early Supporter',
};

module.exports = {
  name: 'badges',
  category: 'utility',
  description: "Show a user's Discord badges. Accepts @user or raw userID.",
  usage: '[@user|userID]',
  cooldown: 3,
  async execute(message, args, client) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true })) || message.author
      : message.author;

    // Fetch the user with force to populate flags if they aren't cached.
    let user = target;
    try {
      user = await message.client.users.fetch(target.id, { force: true });
    } catch { /* fall back to cached */ }

    const flags = user.flags;
    if (!flags || flags.bitfield === 0n) {
      return message.reply({ embeds: [responseBuilder.buildResult({ title: `🎖️ ${user.tag}'s Badges`, description: 'This user has no badges.'})], allowedMentions: { parse: [] } });
    }

    const badgeList = [];
    for (const [bit, name] of Object.entries(FLAG_NAMES)) {
      if (flags.has(Number(bit))) badgeList.push(name);
    }

    const embed = responseBuilder.buildResult({ title: `🎖️ ${user.tag}'s Badges`, description: badgeList.join('\n') || 'No known badges.', thumbnail: user.displayAvatarURL({ size: 256 })});

    return message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
