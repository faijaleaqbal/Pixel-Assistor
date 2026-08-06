// src/commands/utility/badges.js
// Show a user's Discord badges.

const { EmbedBuilder, UserFlagsBitField } = require('discord.js');
const config = require('../../utils/config');
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
  async execute(message, args) {
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
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle(`🎖️ ${user.tag}'s Badges`)
        .setDescription('This user has no badges.')
        .setTimestamp()], allowedMentions: { parse: [] } });
    }

    const badgeList = [];
    for (const [bit, name] of Object.entries(FLAG_NAMES)) {
      if (flags.has(Number(bit))) badgeList.push(name);
    }

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(`🎖️ ${user.tag}'s Badges`)
      .setDescription(badgeList.join('\n') || 'No known badges.')
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setTimestamp();

    return message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
