// src/utils/pagination.js
// Generic paginator for Components V2 container pages.
// Usage:
//   await paginate(interactionOrMessage, containers[], { userId, timeout: 60000 });
//
// `pages` must be an array of ContainerBuilder instances (see utils/v2Reply).
// Buttons: Prev / Page / Next. Stops collecting after timeout, disables buttons.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
} = require('discord.js');
const { opts } = require('./v2Reply');

function withRow(pageContainer, row) {
  return new ContainerBuilder(pageContainer.toJSON()).addActionRowComponents(row);
}

async function paginate(interactionOrMessage, pages, { userId, timeout = 60000, startPage = 0 } = {}) {
  if (!pages.length) return;
  let page = Math.max(0, Math.min(startPage, pages.length - 1));

  const mkRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pg_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('pg_page').setLabel(`Page ${page + 1}/${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('pg_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page === pages.length - 1),
  );

  const render = () => opts(withRow(pages[page], mkRow()));

  // Send appropriately based on whether we got an interaction or a message.
  const sent = interactionOrMessage.replied || interactionOrMessage.deferred
    ? await interactionOrMessage.editReply(render())
    : await interactionOrMessage.channel.send(render());

  const msg = sent && sent.id ? sent : (interactionOrMessage.channel ? await interactionOrMessage.channel.send(render()) : sent);

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: timeout });

  collector.on('collect', async (i) => {
    if (userId && i.user.id !== userId) {
      return i.reply(opts(
        new ContainerBuilder(pages[page].toJSON()).addActionRowComponents(mkRow()),
        { ephemeral: true },
      ));
    }
    if (i.customId === 'pg_prev' && page > 0) page--;
    else if (i.customId === 'pg_next' && page < pages.length - 1) page++;
    await i.update(render());
  });

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pg_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('pg_page').setLabel(`Page ${page + 1}/${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('pg_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );
      await msg.edit(opts(withRow(pages[page], disabledRow)));
    } catch { /* message might be deleted */ }
  });

  return msg;
}

module.exports = { paginate };
