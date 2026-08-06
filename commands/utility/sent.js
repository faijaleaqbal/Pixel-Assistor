// src/commands/utility/sent.js
// Send a message now OR schedule one for later.
//
// THREE supported usage patterns (Bug 1 fix):
//
//   1. `?sent <message>`
//      → Send the message IMMEDIATELY to the SAME channel the command was run in.
//        Example: `?sent hi` → posts "hi" right now in the current channel.
//
//   2. `?sent #channel <message>`
//      → Send the message IMMEDIATELY to the MENTIONED channel.
//        Example: `?sent #general hi` → posts "hi" right now in #general.
//
//   3. `?sent #channel <time> <message>`     (existing scheduled-send behaviour)
//      → Parse the duration, store in DB, fire later via the background poller.
//        Survives restarts. Example: `?sent #general 30s Hello`.
//
// Parsing order:
//   - If the FIRST token is a channel mention, consume it as the target channel.
//   - If the NEXT token matches the duration regex /^(\d+)([smhd])$/, consume it as a delay.
//   - Everything left = message content.
//   - If no channel is mentioned, target = the channel the command was run in.
//   - If no duration token is present, send immediately (cases 1 + 2).
//   - Reply with the "Missing arguments" usage error only if NO message content is left.
//
// Permissions: existing ManageMessages check (kept for all three forms).

const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../utils/db');
const ms = require('../../utils/ms');
const { sendTempReply } = require('../../utils/tempReply');

// Shared duration detection — accepts s/m/h/d/w/y. Delegates to utils/ms.parse.
const isDuration = (tok) => ms.isDuration(tok);

module.exports = {
  name: 'sent',
  category: 'utility',
  description: 'Send a message now, or schedule one for later. ?sent <msg> | ?sent #chan <msg> | ?sent #chan <time> <msg>',
  usage: '[#channel] [time] <message>',
  cooldown: 5,
  permissions: ['ManageMessages'],
  args: true,

  async execute(message, args, client) {
    if (!args.length) {
      return usageError(message, 'Missing message content to send.');
    }

    // ── Tokenize: clone the args array so we can consume from the front ──
    const tokens = args.slice();

    // ── 1. Channel mention? ──
    let targetChannel = message.channel; // default: same channel the command ran in
    const mentionedChannel = message.mentions.channels.first();
    if (mentionedChannel) {
      targetChannel = mentionedChannel;
      // Remove the channel-mention token from the args list (it may appear as `<#id>` or as the raw id).
      const idx = tokens.findIndex((t) =>
        t === `<#${mentionedChannel.id}>` || t === mentionedChannel.id
      );
      if (idx !== -1) tokens.splice(idx, 1);
    }

    // ── 2. Duration token? (only check the FIRST remaining token) ──
    let delayMs = 0;
    if (tokens.length && isDuration(tokens[0])) {
      delayMs = ms.parse(tokens[0]);
      tokens.shift();
    }

    // ── 3. Whatever's left = the message content ──
    const content = tokens.join(' ').trim();

    // If literally nothing is left to send, that's the ONLY case we complain about.
    if (!content && message.attachments.size === 0) {
      return usageError(message, 'Missing message content to send.');
    }

    // ── 4. Permission / channel sanity ──
    if (!targetChannel || !targetChannel.isTextBased?.()) {
      return usageError(message, 'Target channel is not a text channel.');
    }

    const botPerms = targetChannel.permissionsFor(message.guild.members.me);
    if (!botPerms || !botPerms.has('SendMessages')) {
      return message.reply({ embeds: [
        new EmbedBuilder().setColor(0xED4245).setDescription(
          `I don't have **SendMessages** permission in ${targetChannel}.`
        ),
      ] });
    }

    const hasAttachment = message.attachments.size > 0;
    if (hasAttachment && !botPerms.has('AttachFiles')) {
      return message.reply({ embeds: [
        new EmbedBuilder().setColor(0xED4245).setDescription(
          `I don't have **AttachFiles** permission in ${targetChannel} (your message has an attachment).`
        ),
      ] });
    }

    const attachment = hasAttachment ? message.attachments.first() : null;

    // ── 5a. CASE 1 + 2: send immediately (no delay) ──
    if (!delayMs) {
      try {
        const sendOpts = { content: content || '' };
        if (attachment) {
          sendOpts.files = [{ attachment: attachment.url, name: attachment.name || 'attachment' }];
        }
        await targetChannel.send(sendOpts);
        return sendTempReply(message, { embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setDescription(`✅ Sent to ${targetChannel}.`)
            .setTimestamp(),
        ] });
      } catch (e) {
        return message.reply({ embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setDescription(`Failed to send to ${targetChannel}: ${e.message}`),
        ] });
      }
    }

    // ── 5b. CASE 3: scheduled send — store in DB, poller will fire ──
    // Cap duration at 1 year so users don't schedule impossibly far out.
    if (delayMs > 365.25 * 86_400_000) {
      return message.reply({ embeds: [
        new EmbedBuilder().setColor(0xED4245).setDescription('Maximum schedule duration is **1 year**.') ],
      });
    }

    const triggerAt = Date.now() + delayMs;
    const db = getDb();
    let id;
    try {
      id = await db.scheduled.add(
        message.guild.id,
        targetChannel.id,
        message.author.id,
        content || '(no text)',
        attachment?.url || null,
        attachment?.name || null,
        Date.now(),
        triggerAt
      );
    } catch (e) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setDescription(`Failed to schedule: ${e.message}`),
      ] });
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setDescription(
        `✅ Scheduled — will be sent to ${targetChannel} <t:${Math.floor(triggerAt / 1000)}:R>.`
        + (attachment ? `\n📎 Includes attachment: **${attachment.name}**` : '')
      )
      .setFooter({ text: `ID: #${id}` })
      .setTimestamp();

    return sendTempReply(message, { embeds: [embed] });
  },
};

function usageError(message, text) {
  return message.reply({ embeds: [
    new EmbedBuilder().setColor(0xED4245).setDescription(
      `${text}\n\n**Usage:**\n` +
      '• `?sent <message>` — send now in this channel\n' +
      '• `?sent #channel <message>` — send now in another channel\n' +
      '• `?sent #channel <time> <message>` — schedule for later (e.g. `30s`, `5m`, `2h`, `1d`)'
    ),
  ] });
}
