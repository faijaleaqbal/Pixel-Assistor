// src/commands/utility/remind.js
// Instant tag-reminder: DMs the mentioned user immediately.
// Deletes the command message, shows success embed (auto-deletes in 3s).
// Usage: ?remind <@user|userID> [reason]

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');
const { resolveUserArg } = require('../../utils/resolveUser');

module.exports = {
  name: 'remind',
  category: 'utility',
  description: 'DM a reminder to a user instantly. Accepts @user or raw userID.',
  usage: '<@user|userID> [reason]',
  cooldown: 3,
  args: true,
  async execute(message, args, client) {
    const target = await resolveUserArg(message, args[0]);
    if (!target) return;
    if (target.bot) {
      return message.reply(opts(responseBuilder.buildResult({ description: 'Cannot send a reminder to a bot.'})));
    }
    if (target.id === message.author.id) {
      return message.reply(opts(responseBuilder.buildResult({ description: 'You can\'t remind yourself. Use `?rm <duration> [reason]` instead.'})));
    }

    // Strip the mention/ID from args to get the reason
    const reason = args.slice(1).filter((a) => !/^<@!?\d+>$/.test(a) && !/^\d{17,19}$/.test(a)).join(' ') || 'No reason provided.';
    const jumpLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}`;

    const dmEmbed = responseBuilder.buildResult({ title: '\U0001F4DD You\'ve been reminded!', fields: [{ name: 'Reason', value: reason, inline: false },
        { name: 'From', value: message.author.tag, inline: true },
        { name: 'Channel', value: `[Jump to message](${jumpLink})`, inline: true },]});

    // Delete the command message
    await message.delete().catch(() => {});

    // DM the target
    try {
      await target.send(opts(dmEmbed));
    } catch {
      // DMs closed — fallback to a channel mention (no real ping, plain text)
      await message.channel.send(
        opts(buildContainer({ description: `${target.username}, you have a reminder from ${message.author.tag}: **${reason}** — *I tried to DM you but your DMs are closed.*` }), { allowedMentions: { parse: [] } }),
      ).then((m) => { const h = setTimeout(() => m.delete().catch(() => {}), 3000); if (typeof h.unref === 'function') h.unref(); });
      return;
    }

    // Success embed in channel (auto-deletes in 3s)
    const successEmbed = responseBuilder.buildResult({ description: `\u2705 Reminded ${target.username} successfully.`});
    await message.channel.send(opts(successEmbed)).then((m) => { const h = setTimeout(() => m.delete().catch(() => {}), 3000); if (typeof h.unref === 'function') h.unref(); });
  },
};
