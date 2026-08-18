// src/utils/embeds.js
// Central embed factory. Standardizes colors, typography, footers, and styles.

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const config = require('./config');

const COLORS = {
  PRIMARY: config.embedColor || 0x5865F2,
  SUCCESS: 0x57F287,
  ERROR: 0xED4245,
  WARN: 0xFEE75C,
  INFO: 0x5865F2,
  PURPLE: 0x5865F2,
  DARK: 0x2B2D31,
};

const color = (override) => override ?? COLORS.PRIMARY;

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
  return base({ title: `✅ ${title}`, description: message, color: COLORS.SUCCESS });
}

function error(message, title = 'Error') {
  return base({ title: `❌ ${title}`, description: message, color: COLORS.ERROR });
}

function warn(message, title = 'Warning') {
  return base({ title: `⚠️ ${title}`, description: message, color: COLORS.WARN });
}

function info(message, title = 'Information') {
  return base({ title: `ℹ️ ${title}`, description: message, color: COLORS.INFO });
}

function loading(message = 'Processing request…') {
  return base({ description: `⏳ ${message}`, color: COLORS.PRIMARY });
}

// Owner-name resolver — used in footers across the bot.
async function ownerName(client) {
  if (config.helpFooterName) return config.helpFooterName;
  try {
    if (config.ownerId) {
      const u = await client?.users?.fetch(config.ownerId);
      if (u) return u.username;
    }
  } catch { /* ignore */ }
  return client?.user?.username || 'Pixel';
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
  loading,
  ownerName,
  footerWith,
  color,
  COLORS,
  AttachmentBuilder,
  EmbedBuilder,
};

