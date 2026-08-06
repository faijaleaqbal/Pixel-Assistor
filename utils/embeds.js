// src/utils/embeds.js
// Central embed factory. Every command goes through here so the look stays consistent.

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const config = require('./config');

const color = (override) => override ?? config.embedColor;

function base({ title = '', description = '', color: c, thumbnail, image, author, footer, fields = [], timestamp = true } = {}) {
  const e = new EmbedBuilder()
    .setColor(color(c))
    .setTitle(title || null)
    .setDescription(description || null);

  if (thumbnail) e.setThumbnail(thumbnail);
  if (image) e.setImage(image);
  if (author) e.setAuthor(author);
  if (footer) e.setFooter(footer);
  if (fields.length) e.addFields(fields);
  if (timestamp) e.setTimestamp();
  return e;
}

function success(message, title = 'Success') {
  return base({ title, description: message, color: 0x57F287 });
}

function error(message, title = 'Error') {
  return base({ title, description: message, color: 0xED4245 });
}

function warn(message, title = 'Heads Up') {
  return base({ title, description: message, color: 0xFEE75C });
}

function info(message, title = 'Info') {
  return base({ title, description: message });
}

// Owner-name resolver — used in help footers across the bot.
async function ownerName(client) {
  if (config.helpFooterName) return config.helpFooterName;
  try {
    if (config.ownerId) {
      const u = await client.users.fetch(config.ownerId);
      if (u) return u.username;
    }
  } catch { /* ignore */ }
  return client.user?.username || 'Pixel';
}

function footerWith(text, iconURL) {
  return { text, iconURL };
}

module.exports = {
  base,
  success,
  error,
  warn,
  info,
  ownerName,
  footerWith,
  color,
  AttachmentBuilder,
  EmbedBuilder,
};
