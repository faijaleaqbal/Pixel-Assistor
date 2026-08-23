// src/utils/embeds.js
// Central response factory. Standardizes colors, typography, footers, and styles.
// Backward compatibility layer wrapping responseBuilder.
// All builders return Components V2 containers — send with v2Reply.opts().

const { AttachmentBuilder, ContainerBuilder } = require('discord.js');
const responseBuilder = require('./responseBuilder');
const { buildContainer } = require('./v2Reply');

const COLORS = responseBuilder.COLORS;

const color = (override) => override ?? COLORS.PRIMARY;

function base({ title = '', description = '', color: c, thumbnail, image, footer, fields = [] } = {}) {
  return buildContainer({
    title,
    description,
    color: color(c),
    thumbnail,
    image,
    customFooter: footer?.text,
    fields,
  });
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
  ContainerBuilder,
  ...responseBuilder,
};

