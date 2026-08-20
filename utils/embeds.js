// src/utils/embeds.js
// Central embed factory. Standardizes colors, typography, footers, and styles.
// Backward compatibility layer wrapping responseBuilder.

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const responseBuilder = require('./responseBuilder');

const COLORS = responseBuilder.COLORS;

const color = (override) => override ?? COLORS.PRIMARY;

function base({ title = '', description = '', color: c, thumbnail, image, author, footer, fields = [], timestamp = false } = {}) {
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

function success(message, title = 'Success', client) {
  return responseBuilder.buildSuccess({ title, description: message, client });
}

function error(message, title = 'Error', client) {
  return responseBuilder.buildError({ title, error: message, client });
}

function warn(message, title = 'Warning', client) {
  return responseBuilder.buildWarning({ title, description: message, client });
}

function info(message, title = 'Information', client) {
  return responseBuilder.buildInfo({ title, description: message, client });
}

function loading(message = 'Processing request…', client) {
  return responseBuilder.buildInfo({ title: 'Processing', emoji: '⏳', description: message, client });
}

function ownerName(client) {
  return responseBuilder.getDeveloperName(client);
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
  ...responseBuilder,
};

