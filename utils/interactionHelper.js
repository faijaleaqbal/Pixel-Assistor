// src/utils/interactionHelper.js
// Production-grade safe interaction responses.
// Prevents "Unknown interaction", "Interaction already replied", and race failures.

const logger = require('./logger');

const SAFE_IGNORE_CODES = new Set([
  10062, // Unknown interaction
  40060, // Interaction has already been acknowledged
  50027, // Invalid Webhook Token
]);

function isIgnorableError(err) {
  if (!err) return false;
  if (SAFE_IGNORE_CODES.has(err.code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('unknown interaction') ||
    msg.includes('already been acknowledged') ||
    msg.includes('interaction has already replied')
  );
}

async function safeReply(interaction, options) {
  if (!interaction) return null;
  try {
    if (interaction.replied) {
      return await interaction.followUp(options);
    }
    if (interaction.deferred) {
      return await interaction.editReply(options);
    }
    return await interaction.reply(options);
  } catch (err) {
    if (!isIgnorableError(err)) {
      logger.debug('[interactionHelper] safeReply error:', err.message);
    }
    return null;
  }
}

async function safeEditReply(interaction, options) {
  if (!interaction) return null;
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(options);
    }
    return await interaction.reply(options);
  } catch (err) {
    if (!isIgnorableError(err)) {
      logger.debug('[interactionHelper] safeEditReply error:', err.message);
    }
    return null;
  }
}

async function safeFollowUp(interaction, options) {
  if (!interaction) return null;
  try {
    return await interaction.followUp(options);
  } catch (err) {
    if (!isIgnorableError(err)) {
      logger.debug('[interactionHelper] safeFollowUp error:', err.message);
    }
    return null;
  }
}

async function safeDeferReply(interaction, options = {}) {
  if (!interaction || interaction.deferred || interaction.replied) return null;
  try {
    return await interaction.deferReply(options);
  } catch (err) {
    if (!isIgnorableError(err)) {
      logger.debug('[interactionHelper] safeDeferReply error:', err.message);
    }
    return null;
  }
}

async function safeDeferUpdate(interaction) {
  if (!interaction || interaction.deferred || interaction.replied) return null;
  try {
    if (typeof interaction.deferUpdate === 'function') {
      return await interaction.deferUpdate();
    }
  } catch (err) {
    if (!isIgnorableError(err)) {
      logger.debug('[interactionHelper] safeDeferUpdate error:', err.message);
    }
    return null;
  }
}

async function safeUpdate(interaction, options) {
  if (!interaction) return null;
  try {
    if (typeof interaction.update === 'function' && !interaction.replied && !interaction.deferred) {
      return await interaction.update(options);
    }
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(options);
    }
    return await interaction.reply(options);
  } catch (err) {
    if (!isIgnorableError(err)) {
      logger.debug('[interactionHelper] safeUpdate error:', err.message);
    }
    return null;
  }
}

module.exports = {
  safeReply,
  safeEditReply,
  safeFollowUp,
  safeDeferReply,
  safeDeferUpdate,
  safeUpdate,
  isIgnorableError,
};
