// src/commands/utility/view.js
// ?view — Attach an .html file (or reply to a message with one) to get a shareable browser link.
//
// Completely generic: doesn't care what generated the HTML. It downloads the attachment,
// POSTs it to the separate transcript-viewer service, and returns a link.
// The viewer must be running and VIEWER_BASE_URL must be configured in .env.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../utils/config');
const { getBuffer, request } = require('../../utils/http');

/**
 * Fetch a Discord attachment as a raw Buffer.
 * Returns Buffer, or null on failure.
 */
async function fetchAttachmentBuffer(url) {
  try {
    return await getBuffer(url, { timeout: 10000, label: 'Discord Attachment' });
  } catch {
    return null;
  }
}

/**
 * Resolve the HTML attachment from the command message or the replied-to message.
 * Returns { attachment } or { fetchFromReference, channelId } or null.
 */
function findHtmlAttachment(message) {
  // 1. Check command message attachments
  const cmdAttach = message.attachments.find(a =>
    a.name && a.name.toLowerCase().endsWith('.html')
  );
  if (cmdAttach) return { attachment: cmdAttach };

  // 2. Check replied-to message (messageReference)
  if (message.reference?.messageId) {
    return { fetchFromReference: message.reference.messageId, channelId: message.reference.channelId };
  }

  return null;
}

module.exports = {
  name: 'view',
  category: 'utility',
  aliases: ['vw'],
  description: 'Get a shareable browser link for an HTML file.',
  usage: '(attach .html, or reply to a message with .html)',
  cooldown: 3,
  async execute(message) {
    // ── 0. Config check ──
    if (!config.viewerBaseUrl) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          'Viewer service is not configured. Set `VIEWER_BASE_URL` in `.env`.'
        )],
      });
    }

    // ── 1. Find the HTML attachment ──
    const found = findHtmlAttachment(message);
    let htmlAttachment;

    if (!found) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          'No `.html` file found. Attach an HTML file to your message, or reply to a message that has one attached.'
        )],
      });
    }

    if (found.fetchFromReference) {
      // Need to fetch the referenced message
      try {
        const channel = message.client.channels.cache.get(found.channelId)
          || await message.client.channels.fetch(found.channelId).catch(() => null);
        if (!channel) {
          return message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Could not find the referenced channel.')],
          });
        }
        const refMsg = await channel.messages.fetch(found.fetchFromReference).catch(() => null);
        if (!refMsg) {
          return message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Could not find the referenced message.')],
          });
        }
        htmlAttachment = refMsg.attachments.find(a =>
          a.name && a.name.toLowerCase().endsWith('.html')
        );
        if (!htmlAttachment) {
          return message.reply({
            embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
              'The referenced message does not have an `.html` file attached.'
            )],
          });
        }
      } catch (e) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
            `Failed to fetch the referenced message: ${e.message}`
          )],
        });
      }
    } else {
      htmlAttachment = found.attachment;
    }

    // ── 2. Download the HTML content as a buffer ──
    const htmlBuffer = await fetchAttachmentBuffer(htmlAttachment.url);
    if (!htmlBuffer || htmlBuffer.length === 0) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          'Failed to download the HTML file. The attachment may have expired or is too large.'
        )],
      });
    }

    // ── 3. POST raw buffer to the viewer service ──
    let uploadResult;
    try {
      const uploadUrl = `${config.viewerBaseUrl.replace(/\/+$/, '')}/upload`;
      const res = await request(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: htmlBuffer,
        timeout: 8000,
        label: 'Viewer Service',
        allowInternal: true,
      });

      uploadResult = await res.json();
    } catch (e) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
          `Viewer service error: ${e.message}`
        )],
      });
    }

    // ── 4. Reply with the link ──
    const viewerUrl = uploadResult.url;
    if (!viewerUrl) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription(
          'Viewer service returned an unexpected response (no URL).'
        )],
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📄 HTML File Hosted')
      .addFields(
        { name: 'File', value: `\`${htmlAttachment.name}\``, inline: true },
        { name: 'Size', value: `${(htmlBuffer.length / 1024).toFixed(1)} KB`, inline: true },
        { name: 'Hash', value: `\`${uploadResult.file || 'unknown'}\``, inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('✅ View File')
        .setStyle(ButtonStyle.Link)
        .setURL(viewerUrl),
    );

    return message.reply({
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: [] },
    });
  },
};
