// src/utils/responseBuilder.js
// Centralized response design system for Pixel-Assistor.
// Unifies the visual language across all 124 commands in 8 categories.

const { EmbedBuilder } = require('discord.js');
const config = require('./config');

const COLORS = {
  SUCCESS: 0x57F287,
  INFO: config.embedColor || 0x5865F2,
  WARNING: 0xFEE75C,
  ERROR: 0xED4245,
  NEUTRAL: 0x2B2D31,
  PRIMARY: config.embedColor || 0x5865F2,
  DARK: 0x2B2D31,
};

function getDeveloperName(client) {
  if (config.helpFooterName) return config.helpFooterName;
  if (config.ownerId && client?.users?.cache?.has(config.ownerId)) {
    return client.users.cache.get(config.ownerId).username;
  }
  return 'Entity';
}

function getArrowPrefix() {
  const space = process.env.HELP_EMOJI_SPACE || '';
  const arrow = process.env.HELP_EMOJI_ARROW || '›';
  return space ? `${space} ${arrow} ` : `${arrow} `;
}

function formatField(name, value) {
  const arrowPrefix = getArrowPrefix();
  return `${arrowPrefix}**${name}:** ${value}`;
}

function formatLine(text) {
  const arrowPrefix = getArrowPrefix();
  return `${arrowPrefix}${text}`;
}

function formatDescription({
  title,
  emoji,
  fields = [],
  description,
  content,
  client,
  devName: customDevName,
  customFooter,
}) {
  const arrowPrefix = getArrowPrefix();
  const devName = customDevName || getDeveloperName(client);
  const timestamp = Math.floor(Date.now() / 1000);

  const parts = [];

  if (title) {
    const icon = emoji ? `${emoji} | ` : '';
    parts.push(`## ${icon}**${title}**\n`);
  }

  if (description) {
    parts.push(description);
  }

  if (fields && fields.length) {
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === 'string') {
        parts.push(`${arrowPrefix}${f}`);
      } else if (f.name && f.value !== undefined && f.value !== null) {
        parts.push(`${arrowPrefix}**${f.name}:** ${f.value}`);
      }
    }
  }

  if (content) {
    if (parts.length > 0) parts.push('');
    parts.push(content);
  }

  const footerLine = customFooter || `-# Developed by **${devName}** • <t:${timestamp}:f>`;
  parts.push('', footerLine);

  return parts.join('\n');
}

function buildSuccess({
  title = 'Success',
  emoji = '✅',
  fields = [],
  description,
  content,
  client,
  devName,
  color = COLORS.SUCCESS,
  thumbnail,
  image,
  customFooter,
} = {}) {
  const desc = formatDescription({ title, emoji, fields, description, content, client, devName, customFooter });
  const embed = new EmbedBuilder().setColor(color).setDescription(desc);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  return embed;
}

function buildError({
  title = 'Command Failed',
  emoji = '❌',
  error,
  usage,
  fields = [],
  description,
  content,
  client,
  devName,
  color = COLORS.ERROR,
  customFooter,
} = {}) {
  const allFields = [...fields];
  if (error) {
    allFields.unshift({ name: 'Error', value: error });
  }
  if (usage) {
    allFields.push({ name: 'Usage', value: `\`${usage}\`` });
  }

  const desc = formatDescription({ title, emoji, fields: allFields, description, content, client, devName, customFooter });
  return new EmbedBuilder().setColor(color).setDescription(desc);
}

function buildWarning({
  title = 'Warning',
  emoji = '⚠️',
  fields = [],
  description,
  content,
  client,
  devName,
  color = COLORS.WARNING,
  thumbnail,
  image,
  customFooter,
} = {}) {
  const desc = formatDescription({ title, emoji, fields, description, content, client, devName, customFooter });
  const embed = new EmbedBuilder().setColor(color).setDescription(desc);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  return embed;
}

function buildInfo({
  title = 'Information',
  emoji = 'ℹ️',
  fields = [],
  description,
  content,
  client,
  devName,
  color = COLORS.INFO,
  thumbnail,
  image,
  customFooter,
} = {}) {
  const desc = formatDescription({ title, emoji, fields, description, content, client, devName, customFooter });
  const embed = new EmbedBuilder().setColor(color).setDescription(desc);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  return embed;
}

function buildResult({
  title,
  emoji = '📊',
  fields = [],
  description,
  content,
  client,
  devName,
  color = COLORS.NEUTRAL,
  thumbnail,
  image,
  customFooter,
} = {}) {
  const desc = formatDescription({ title, emoji, fields, description, content, client, devName, customFooter });
  const embed = new EmbedBuilder().setColor(color).setDescription(desc);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  return embed;
}

function buildPermissionDenied({ required, title = 'Permission Denied', emoji = '🔒', client }) {
  return buildError({
    title,
    emoji,
    fields: [{ name: 'Required', value: required }],
    client,
  });
}

function buildConfirmation({
  title = 'Confirmation Required',
  emoji = '⚠️',
  action,
  target,
  warning,
  fields = [],
  client,
}) {
  const allFields = [];
  if (action) allFields.push({ name: 'Action', value: action });
  if (target) allFields.push({ name: 'Target', value: target });
  if (warning) allFields.push({ name: 'Warning', value: warning });
  allFields.push(...fields);

  return buildWarning({
    title,
    emoji,
    fields: allFields,
    client,
  });
}

function buildList({
  title = 'Results',
  emoji = '📋',
  items = [],
  page = 1,
  totalPages = 1,
  fields = [],
  content,
  client,
  color = COLORS.NEUTRAL,
}) {
  const arrowPrefix = getArrowPrefix();
  const listLines = items.map((it) => `${arrowPrefix}${it}`).join('\n');
  const fullContent = [listLines, content].filter(Boolean).join('\n\n');
  const pageTitle = totalPages > 1 ? `${title} • Page ${page}/${totalPages}` : title;

  return buildResult({
    title: pageTitle,
    emoji,
    fields,
    content: fullContent,
    client,
    color,
  });
}

module.exports = {
  COLORS,
  getDeveloperName,
  getArrowPrefix,
  formatField,
  formatLine,
  formatDescription,
  buildSuccess,
  buildError,
  buildWarning,
  buildInfo,
  buildResult,
  buildPermissionDenied,
  buildConfirmation,
  buildList,
};
