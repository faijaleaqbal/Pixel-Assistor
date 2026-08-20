const responseBuilder = require('../../utils/responseBuilder');
// src/commands/upi/qr.js
// Generate a UPI payment QR code.
// Usage: ?qr [label-or-upi-id] [amount|flexible] [note...]
//
// Flexible argument parsing:
//   ?qr                                    → fully interactive (step-by-step)
//   ?qr 500                                → default saved UPI, amount 500
//   ?qr flexible                           → default saved UPI, no fixed amount
//   ?qr Mbk Main 500 For rent              → saved label "Mbk Main", amount 500, note "For rent"
//   ?qr Mbk Main flexible                  → saved label "Mbk Main", no fixed amount
//   ?qr john@paytm 250 For lunch           → raw UPI ID, amount 250, note "For lunch"
//   ?qr john@paytm flexible                → raw UPI ID, no fixed amount

const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../utils/config');
const { getDb } = require('../../utils/db');
const QRCode = require('qrcode');

const USAGE_EMBED = (prefix) => responseBuilder.buildResult({ title: 'Please use the command in the proper format!', description: '```\n' +
    `${prefix}qr\n` +
    `${prefix}qr 500\n` +
    `${prefix}qr flexible\n` +
    `${prefix}qr Mbk Main 500 For rent\n` +
    `${prefix}qr Mbk Main flexible\n` +
    `${prefix}qr john@paytm 250 For lunch\n` +
    `${prefix}qr john@paytm flexible\n` +
    '```'});

/**
 * Parse the raw args array into { upiId, label, amount, note, isRawUpi, isFlexible }.
 * Returns null if the format is invalid.
 */
function parseArgs(args) {
  // Case 1: no args → interactive mode
  if (!args.length) return { mode: 'interactive' };

  const first = args[0];
  const isRawUpi = first.includes('@');

  // Helper: check if token is "flexible" (case-insensitive)
  const isFlexible = (t) => t && t.toLowerCase() === 'flexible';
  // Helper: check if token is a valid positive number
  const isNum = (t) => t && !isNaN(t) && Number(t) > 0;

  if (isRawUpi) {
    // First token is a raw UPI ID
    const rawUpi = first;
    if (args.length === 1) {
      // ?qr user@bank  → raw UPI, no amount, no note → treat as interactive-like but with UPI known
      return { mode: 'raw_no_amount', upiId: rawUpi, isRawUpi: true };
    }

    const second = args[1];
    if (isFlexible(second)) {
      // ?qr user@bank flexible [note...]
      const note = args.slice(2).join(' ') || null;
      return { mode: 'ready', upiId: rawUpi, isRawUpi: true, isFlexible: true, amount: null, note };
    }
    if (isNum(second)) {
      // ?qr user@bank 250 [note...]
      const amount = parseFloat(second);
      const note = args.slice(2).join(' ') || null;
      return { mode: 'ready', upiId: rawUpi, isRawUpi: true, isFlexible: false, amount, note };
    }
    // second token is neither flexible nor a number → invalid
    return null;
  }

  // First token is NOT a raw UPI → could be: amount, flexible, or a label

  // Check if first token is a number  → ?qr 500 [note...]
  if (isNum(first)) {
    const amount = parseFloat(first);
    const note = args.slice(1).join(' ') || null;
    return { mode: 'label_default', isFlexible: false, amount, note };
  }

  // Check if first token is "flexible" → ?qr flexible [note...]
  if (isFlexible(first)) {
    const note = args.slice(1).join(' ') || null;
    return { mode: 'label_default', isFlexible: true, amount: null, note };
  }

  // First token is neither number nor flexible → treat as label (may be multi-word).
  // We need to find where the label ends and the amount/flexible begins.
  // Strategy: scan from the END backwards to find the FIRST token that is a number
  // or "flexible". That token is the amount (or flexible flag), everything after it
  // is the note, everything before it is the label.
  // Examples:
  //   ?qr Mbk Main 500 For rent    → label="Mbk Main", amount=500, note="For rent"
  //   ?qr Mbk Main flexible        → label="Mbk Main", flexible=true, no note
  //   ?qr Mbk Main flexible rent   → label="Mbk Main", flexible=true, note="rent"
  //   ?qr Mbk Main                 → label="Mbk Main", no amount → interactive for this label
  let amountIdx = -1;
  for (let i = args.length - 1; i >= 1; i--) {
    if (isNum(args[i]) || isFlexible(args[i])) { amountIdx = i; break; }
  }

  if (amountIdx === -1) {
    // No amount or flexible found → just a label with no amount
    // ?qr Mbk Main → label "Mbk Main", no amount → interactive for this label
    const label = args.join(' ');
    return { mode: 'label_no_amount', label };
  }

  const label = args.slice(0, amountIdx).join(' ');
  const amountOrFlag = args[amountIdx];
  const noteTokens = args.slice(amountIdx + 1);
  const note = noteTokens.length ? noteTokens.join(' ') : null;

  if (isFlexible(amountOrFlag)) {
    return { mode: 'label_lookup', label, isFlexible: true, amount: null, note };
  }
  return { mode: 'label_lookup', label, isFlexible: false, amount: parseFloat(amountOrFlag), note };
}

/**
 * Build the UPI deep link string.
 */
function buildUpiLink(upiId, name, amount, note) {
  const params = new URLSearchParams();
  params.set('pa', upiId);
  params.set('pn', name);
  if (amount != null) params.set('am', amount.toFixed(2));
  if (note) params.set('tn', note);
  params.set('cu', 'INR');
  return `upi://pay?${params.toString()}`;
}

/**
 * Send the QR embed with image and Copy UPI ID button.
 */
async function sendQrEmbed(message, upiId, displayName, amount, note, isFlexible) {
  const upiLink = buildUpiLink(upiId, displayName, amount, note);

  let png;
  try {
    png = await QRCode.toBuffer(upiLink, { width: 512, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  } catch (e) {
    return message.reply({ embeds: [responseBuilder.buildResult({ description: `QR generation failed: ${e.message}`})] });
  }

  const attachment = new AttachmentBuilder(png, { name: 'upi-qr.png' });

  const descLines = [`Scan this to pay **${displayName}**.`];
  descLines.push(`> UPI ID: ${upiId}`);
  if (isFlexible) {
    descLines.push('> Amount: Flexible');
  } else if (amount != null) {
    descLines.push(`> Amount: ${amount.toFixed(2)}`);
  }

  const embed = responseBuilder.buildResult({ title: '🧾 UPI Payment QR Code', description: descLines.join('\n'), image: 'attachment://upi-qr.png'});

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`copy_upi_${upiId}`)
      .setLabel('Copy UPI ID')
      .setStyle(ButtonStyle.Secondary)
  );

  return message.reply({ embeds: [embed], files: [attachment], components: [row] });
}

/**
 * Interactive mode: ask step-by-step via buttons + collector.
 */
async function interactiveMode(message) {
  const rows = await getDb().upi.list(message.author.id);

  // Step 1: If user has saved UPIs, show a select prompt; otherwise ask for raw UPI
  if (rows.length > 0) {
    // Build button rows for saved UPIs (max 25 buttons, 5 per row, 5 rows)
    const buttonRows = [];
    const chunkSize = 5;
    for (let i = 0; i < Math.min(rows.length, 25); i += chunkSize) {
      const row = new ActionRowBuilder();
      for (let j = i; j < Math.min(i + chunkSize, rows.length, 25); j++) {
        const label = rows[j].label;
        const safeLabel = label.length > 80 ? label.slice(0, 80) : label;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`qr_int_label_${safeLabel}`)
            .setLabel(label.length > 80 ? label.slice(0, 80) : label)
            .setStyle(ButtonStyle.Primary)
        );
      }
      buttonRows.push(row);
    }
    // Add a "Enter UPI ID manually" button
    buttonRows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('qr_int_manual')
          .setLabel('Enter UPI ID manually')
          .setStyle(ButtonStyle.Secondary)
      )
    );

    const promptEmbed = responseBuilder.buildResult({ title: '🧾 UPI QR — Select a saved UPI', description: 'Choose one of your saved UPI IDs below, or enter a UPI ID manually.'});

    const promptMsg = await message.reply({ embeds: [promptEmbed], components: buttonRows });

    const collector = promptMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();
      collector.stop('selected');

      let selectedUpiId;
      if (interaction.customId === 'qr_int_manual') {
        // Ask for UPI ID via follow-up message
        const askEmbed = responseBuilder.buildResult({ description: 'Please type your UPI ID (e.g. `name@bank`). You have 60 seconds.'});
        await promptMsg.edit({ embeds: [askEmbed], components: [] });

        const msgCollector = message.channel.createMessageCollector({
          filter: (m) => m.author.id === message.author.id,
          time: 60000,
          max: 1,
        });

        msgCollector.on('collect', async (m) => {
          const rawUpi = m.content.trim();
          if (!rawUpi.includes('@')) {
            return m.reply({ embeds: [responseBuilder.buildResult({ description: 'That doesn\'t look like a valid UPI ID. Cancelled.'})] }).then((r) => setTimeout(() => r.delete().catch(() => {}), 5000));
          }
          // Ask for amount
          await askAmountAndGenerate(message, promptMsg, rawUpi, message.author.username);
        });

        msgCollector.on('end', (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            promptMsg.edit({ embeds: [responseBuilder.buildResult({ description: '⏰ Timed out — UPI QR creation cancelled.'})], components: [] }).catch(() => {});
          }
        });
        return;
      }

      // A saved label was selected
      const selectedLabel = interaction.customId.replace('qr_int_label_', '');
      const found = rows.find((r) => r.label === selectedLabel);
      if (!found) return;
      selectedUpiId = found.upiId;
      await askAmountAndGenerate(message, promptMsg, selectedUpiId, message.author.username);
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        promptMsg.edit({ embeds: [responseBuilder.buildResult({ description: '⏰ Timed out — UPI QR creation cancelled.'})], components: [] }).catch(() => {});
      }
    });
  } else {
    // No saved UPIs — ask for raw UPI ID
    const askEmbed = responseBuilder.buildResult({ title: '🧾 UPI QR — Enter your UPI ID', description: 'You have no saved UPI IDs. Please type your UPI ID (e.g. `name@bank`).\nYou have 60 seconds.'});

    const promptMsg = await message.reply({ embeds: [askEmbed] });

    const msgCollector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === message.author.id,
      time: 60000,
      max: 1,
    });

    msgCollector.on('collect', async (m) => {
      const rawUpi = m.content.trim();
      if (!rawUpi.includes('@')) {
        return m.reply({ embeds: [responseBuilder.buildResult({ description: 'That doesn\'t look like a valid UPI ID. Cancelled.'})] }).then((r) => setTimeout(() => r.delete().catch(() => {}), 5000));
      }
      await askAmountAndGenerate(message, promptMsg, rawUpi, message.author.username);
    });

    msgCollector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        promptMsg.edit({ embeds: [responseBuilder.buildResult({ description: '⏰ Timed out — UPI QR creation cancelled.'})], components: [] }).catch(() => {});
      }
    });
  }
}

/**
 * Interactive step 2: ask for amount/flexible, then optionally note, then generate QR.
 */
async function askAmountAndGenerate(message, promptMsg, upiId, displayName) {
  const amountRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('qr_int_flexible')
      .setLabel('Flexible Amount')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('qr_int_enter_amount')
      .setLabel('Enter Amount')
      .setStyle(ButtonStyle.Primary)
  );

  const askEmbed = responseBuilder.buildResult({ description: `UPI ID: \`${upiId}\`\nWould you like a fixed amount or flexible?`});

  await promptMsg.edit({ embeds: [askEmbed], components: [amountRow] });

  const collector = promptMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === message.author.id,
    time: 60000,
  });

  collector.on('collect', async (interaction) => {
    await interaction.deferUpdate();
    collector.stop('selected');

    if (interaction.customId === 'qr_int_flexible') {
      // Ask for optional note
      await askNoteAndGenerate(message, promptMsg, upiId, displayName, null, true);
    } else {
      // Ask for amount via text
      const amtEmbed = responseBuilder.buildResult({ description: 'Please type the amount (e.g. `500`). You have 60 seconds.'});
      await promptMsg.edit({ embeds: [amtEmbed], components: [] });

      const msgCollector = message.channel.createMessageCollector({
        filter: (m) => m.author.id === message.author.id,
        time: 60000,
        max: 1,
      });

      msgCollector.on('collect', async (m) => {
        const val = parseFloat(m.content.trim());
        if (isNaN(val) || val <= 0) {
          return m.reply({ embeds: [responseBuilder.buildResult({ description: 'Invalid amount. Must be a positive number. Cancelled.'})] }).then((r) => setTimeout(() => r.delete().catch(() => {}), 5000));
        }
        await askNoteAndGenerate(message, promptMsg, upiId, displayName, val, false);
      });

      msgCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          promptMsg.edit({ embeds: [responseBuilder.buildResult({ description: '⏰ Timed out — UPI QR creation cancelled.'})], components: [] }).catch(() => {});
        }
      });
    }
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      promptMsg.edit({ embeds: [responseBuilder.buildResult({ description: '⏰ Timed out — UPI QR creation cancelled.'})], components: [] }).catch(() => {});
    }
  });
}

/**
 * Interactive step 3: ask for optional note, then generate QR.
 */
async function askNoteAndGenerate(message, promptMsg, upiId, displayName, amount, isFlexible) {
  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('qr_int_skip_note')
      .setLabel('Skip Note')
      .setStyle(ButtonStyle.Secondary)
  );

  const noteEmbed = responseBuilder.buildResult({ description: 'Type a payment note (or click **Skip Note** to continue without one). You have 60 seconds.'});

  await promptMsg.edit({ embeds: [noteEmbed], components: [skipRow] });

  const btnCollector = promptMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === message.author.id,
    time: 60000,
    max: 1,
  });

  const msgCollector = message.channel.createMessageCollector({
    filter: (m) => m.author.id === message.author.id,
    time: 60000,
    max: 1,
  });

  let handled = false;

  const finish = async (note) => {
    if (handled) return;
    handled = true;
    btnCollector.stop();
    msgCollector.stop();
    await promptMsg.delete().catch(() => {});
    await sendQrEmbed(message, upiId, displayName, amount, note, isFlexible);
  };

  btnCollector.on('collect', async (interaction) => {
    if (interaction.customId === 'qr_int_skip_note') {
      await interaction.deferUpdate();
      await finish(null);
    }
  });

  msgCollector.on('collect', async (m) => {
    await finish(m.content.trim() || null);
  });

  const onEnd = () => {
    if (!handled) {
      handled = true;
      promptMsg.edit({ embeds: [responseBuilder.buildResult({ description: '⏰ Timed out — UPI QR creation cancelled.'})], components: [] }).catch(() => {});
    }
  };
  btnCollector.on('end', (_, reason) => { if (reason === 'time') onEnd(); });
  msgCollector.on('end', (_, reason) => { if (reason === 'time') onEnd(); });
}

// ─── Main execute ─────────────────────────────────────────────────────────

module.exports = {
  name: 'qr',
  aliases: ['qrcode'],
  category: 'upi',
  description: 'Generate a UPI payment QR code.',
  usage: '[label-or-upi-id] [amount|flexible] [note...]',
  cooldown: 5,
  args: false,  // Changed: args are now optional (interactive mode)
  async execute(message, args, client) {
    const parsed = parseArgs(args);

    // ── Interactive mode ──
    if (!parsed || parsed.mode === 'interactive') {
      if (!parsed) {
        // Invalid format
        return message.reply({ embeds: [USAGE_EMBED(config.prefix)] });
      }
      return interactiveMode(message);
    }

    // ── ?qr 500 or ?qr flexible (use default/saved UPI) ──
    if (parsed.mode === 'label_default') {
      const rows = await getDb().upi.list(message.author.id);
      if (!rows.length) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: `You have no saved UPI IDs. Use \`${config.prefix}setupi <label> <upi-id>\` to save one first, or provide a UPI ID directly like \`${config.prefix}qr user@bank 500\`.`})] });
      }
      // Use the first saved UPI as default
      const defaultEntry = rows[0];
      return sendQrEmbed(message, defaultEntry.upiId, message.author.username, parsed.amount, parsed.note, parsed.isFlexible);
    }

    // ── ?qr user@bank (raw UPI, no amount) → interactive for amount ──
    if (parsed.mode === 'raw_no_amount') {
      return askAmountAndGenerate(message, await message.reply({ embeds: [responseBuilder.buildResult({ description: `UPI ID: \`${parsed.upiId}\`\nNow let\'s set the amount...`})], fetchReply: true }), parsed.upiId, message.author.username);
    }

    // ── ?qr user@bank 250 For lunch (raw UPI, ready) ──
    if (parsed.mode === 'ready' && parsed.isRawUpi) {
      return sendQrEmbed(message, parsed.upiId, message.author.username, parsed.amount, parsed.note, parsed.isFlexible);
    }

    // ── ?qr Mbk Main 500 For rent (label lookup, ready) ──
    if (parsed.mode === 'label_lookup') {
      const rows = await getDb().upi.list(message.author.id);
      const found = rows.find((r) => r.label.toLowerCase() === parsed.label.toLowerCase());
      if (!found) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: `No saved UPI under label \`${parsed.label}\`. Run \`${config.prefix}listupi\` to see your labels.`})] });
      }
      return sendQrEmbed(message, found.upiId, message.author.username, parsed.amount, parsed.note, parsed.isFlexible);
    }

    // ── ?qr Mbk Main (label, no amount) → interactive for amount ──
    if (parsed.mode === 'label_no_amount') {
      const rows = await getDb().upi.list(message.author.id);
      const found = rows.find((r) => r.label.toLowerCase() === parsed.label.toLowerCase());
      if (!found) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: `No saved UPI under label \`${parsed.label}\`. Run \`${config.prefix}listupi\` to see your labels.`})] });
      }
      return askAmountAndGenerate(message, await message.reply({ embeds: [responseBuilder.buildResult({ description: `UPI ID: \`${found.upiId}\` (label: \`${parsed.label}\`)\nNow let\'s set the amount...`})], fetchReply: true }), found.upiId, message.author.username);
    }

    // Fallback: invalid format
    return message.reply({ embeds: [USAGE_EMBED(config.prefix)] });
  },
};
