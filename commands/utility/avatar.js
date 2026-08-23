const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/avatar.js

const { ApplicationCommandOptionType } = require('discord.js');
const { resolveUserArg } = require('../../utils/resolveUser');
const { opts } = require('../../utils/v2Reply');

module.exports = {
  name: 'avatar',
  category: 'utility',
  description: "Display a user's avatar in high resolution.",
  usage: '[@user|userID]',
  aliases: ['av', 'pfp'],
  cooldown: 3,
  slash: true,
  slashOptions: [
    {
      name: 'user',
      description: 'Select a user to view their avatar',
      type: ApplicationCommandOptionType.User,
      required: false,
    },
  ],
  async execute(message, args, client) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true })) || message.author
      : message.author;
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    const url = member?.displayAvatarURL?.({ size: 4096, extension: 'png' }) || target.displayAvatarURL({ size: 4096, extension: 'png' });
    return message.reply(
      opts(responseBuilder.buildResult({ title: `🖼️ ${target.tag}'s avatar`, image: url}), { allowedMentions: { parse: [] } }),
    );
  },
  async slashExecute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(() => null) : null;
    const url = member?.displayAvatarURL?.({ size: 4096, extension: 'png' }) || target.displayAvatarURL({ size: 4096, extension: 'png' });
    return interaction.reply(opts(responseBuilder.buildResult({ title: `🖼️ ${target.tag}'s avatar`, image: url})));
  },
};

