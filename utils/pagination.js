// src/utils/pagination.js
// Generic paginator for embed pages.
// Usage:
//   await pagination(message, pages[], { userId: message.author.id, timeout: 60000 });
//
// Buttons: Prev / Page / Next. Stops collecting after timeout, disables buttons.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

async function paginate(interactionOrMessage, pages, { userId, timeout = 60000, startPage = 0 } = {}) {
  if (!pages.length) return;
  let page = Math.max(0, Math.min(startPage, pages.length - 1));

  const mkRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pg_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('pg_page').setLabel(`Page ${page + 1}/${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('pg_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page === pages.length - 1),
  );

  const payload = { embeds: [pages[page]], components: [mkRow()] };

  // Send appropriately based on whether we got an interaction or a message.
  const sent = interactionOrMessage.replied || interactionOrMessage.deferred
    ? await interactionOrMessage.editReply(payload)
    : await interactionOrMessage.channel.send(payload);

  const msg = sent && sent.id ? sent : (interactionOrMessage.channel ? await interactionOrMessage.channel.send(payload) : sent);

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: timeout });

  collector.on('collect', async (i) => {
    if (userId && i.user.id !== userId) {
      return i.reply({ content: 'This pagination menu belongs to someone else.', ephemeral: true });
    }
    if (i.customId === 'pg_prev' && page > 0) page--;
    else if (i.customId === 'pg_next' && page < pages.length - 1) page++;
    await i.update({ embeds: [pages[page]], components: [mkRow()] });
  });

  collector.on('end', async () => {
    try {
      await msg.edit({ components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pg_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('pg_page').setLabel(`Page ${page + 1}/${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('pg_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(true),
      )] });
    } catch { /* message might be deleted */ }
  });

  return msg;
}

module.exports = { paginate };
