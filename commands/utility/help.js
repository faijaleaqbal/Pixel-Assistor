// src/commands/utility/help.js
// Help command — Rainy Assistant style UI redesign for Pixel Assistant.
// Clean, compact, paginated Discord embed interface with dropdown navigation.

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationCommandOptionType,
} = require('discord.js');
const config = require('../../utils/config');
const meta = require('../../utils/commandMeta');
const { EMOJI, DISPLAY, DESC } = require('../../utils/categories');
const { getPrefix } = require('../../utils/prefixCache');
const logger = require('../../utils/logger');
const subs = require('../../utils/subcommands');

// State map: messageId -> { userId, username, category, page, total, prefix }
const state = new Map();

const COMMANDS_PER_PAGE = 7;

function formatFooterDate(d = new Date()) {
  const day = d.getUTCDate();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

function makeFooter() {
  return {
    text: `Developed by Pixel Assistant • ${formatFooterDate()}`,
  };
}

module.exports = {
  name: 'help',
  category: 'utility',
  aliases: ['h', 'commands', 'menu'],
  description: 'Explore the command list with interactive category navigation and pagination.',
  usage: '[command]',
  cooldown: 3,
  slash: true,
  slashOptions: [
    {
      name: 'command',
      description: 'Command name to view detailed syntax and usage',
      type: ApplicationCommandOptionType.String,
      required: false,
    },
  ],

  // ── Prefix execution (?help / ?help <command>) ──
  async execute(message, args, client) {
    const currentPrefix = await getPrefix(message.guild?.id);

    // ?help <command>
    if (args[0]) {
      const m = meta.get(args[0].toLowerCase());
      if (!m) {
        return message.reply({
          embeds: [
            err(`No command found matching \`${args[0]}\`.\nType \`${currentPrefix}help\` to browse all categories.`),
          ],
        });
      }
      return message.reply({
        embeds: [buildCommandDetailEmbed(m, currentPrefix)],
      });
    }

    // ?help -> Home overview
    const user = message.author;
    const home = buildHomeEmbed(client, currentPrefix, user);
    const rows = makeRows(null, 0, 1);
    const sent = await message.reply({ embeds: [home], components: rows });

    state.set(sent.id, {
      userId: user.id,
      username: user.username,
      category: null,
      page: 0,
      total: 1,
      prefix: currentPrefix,
    });

    // Clean up state after 30 minutes
    const cleanupHandle = setTimeout(() => state.delete(sent.id), 30 * 60 * 1000);
    if (typeof cleanupHandle.unref === 'function') cleanupHandle.unref();
  },

  // ── Slash execution (/help [command]) ──
  async slashExecute(interaction, client) {
    const currentPrefix = await getPrefix(interaction.guildId);
    const cmdName = interaction.options.getString('command');

    if (cmdName) {
      const m = meta.get(cmdName.toLowerCase());
      if (!m) {
        return interaction.reply({
          embeds: [err(`No command found matching \`${cmdName}\`.\nUse \`/help\` to browse all categories.`)],
          ephemeral: true,
        });
      }
      return interaction.reply({ embeds: [buildCommandDetailEmbed(m, currentPrefix)] });
    }

    const user = interaction.user;
    const home = buildHomeEmbed(client, currentPrefix, user);
    const rows = makeRows(null, 0, 1);
    const sent = await interaction.reply({ embeds: [home], components: rows, fetchReply: true });

    state.set(sent.id, {
      userId: user.id,
      username: user.username,
      category: null,
      page: 0,
      total: 1,
      prefix: currentPrefix,
    });

    const cleanupHandle = setTimeout(() => state.delete(sent.id), 30 * 60 * 1000);
    if (typeof cleanupHandle.unref === 'function') cleanupHandle.unref();
  },

  // ── Central interaction router ──
  async handleInteraction(interaction, client) {
    try {
      const currentPrefix = await getPrefix(interaction.guildId);
      const messageId = interaction.message.id;
      let st = state.get(messageId);

      // Security check: only the invoking user may control this menu
      if (st && st.userId && st.userId !== interaction.user.id) {
        return interaction.reply({
          content: `❌ This help menu belongs to **${st.username || 'another user'}**. Use \`${st.prefix || currentPrefix}help\` to open your own menu!`,
          ephemeral: true,
        });
      }

      if (!st) {
        st = {
          userId: interaction.user.id,
          username: interaction.user.username,
          category: null,
          page: 0,
          total: 1,
          prefix: currentPrefix,
        };
      }

      // Category dropdown selection
      if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
        const selected = interaction.values[0];

        if (selected === 'home' || !selected) {
          st.category = null;
          st.page = 0;
          st.total = 1;
          state.set(messageId, st);

          const homeEmbed = buildHomeEmbed(client, currentPrefix, interaction.user);
          return interaction.update({
            embeds: [homeEmbed],
            components: makeRows(null, 0, 1),
          });
        }

        const totalPages = calcTotalPages(selected);
        st.category = selected;
        st.page = 0;
        st.total = totalPages;
        st.prefix = currentPrefix;
        state.set(messageId, st);

        const catEmbed = buildCategoryEmbed(client, selected, 0, totalPages, currentPrefix);
        return interaction.update({
          embeds: [catEmbed],
          components: makeRows(selected, 0, totalPages),
        });
      }

      // Buttons clicked (First / Prev / Next / Last / Home)
      if (interaction.isButton()) {
        const id = interaction.customId;

        if (id === 'help_home' || !st.category) {
          st.category = null;
          st.page = 0;
          st.total = 1;
          state.set(messageId, st);

          const homeEmbed = buildHomeEmbed(client, currentPrefix, interaction.user);
          return interaction.update({
            embeds: [homeEmbed],
            components: makeRows(null, 0, 1),
          });
        }

        const totalPages = calcTotalPages(st.category);
        st.total = totalPages;

        if (id === 'help_first') {
          st.page = 0;
        } else if (id === 'help_prev') {
          st.page = Math.max(0, st.page - 1);
        } else if (id === 'help_next') {
          st.page = Math.min(totalPages - 1, st.page + 1);
        } else if (id === 'help_last') {
          st.page = Math.max(0, totalPages - 1);
        }

        state.set(messageId, st);
        const catEmbed = buildCategoryEmbed(client, st.category, st.page, totalPages, currentPrefix);
        return interaction.update({
          embeds: [catEmbed],
          components: makeRows(st.category, st.page, totalPages),
        });
      }
    } catch (e) {
      logger.error('help interaction error', e?.message || e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Help menu error: ' + (e?.message || 'unknown'),
          ephemeral: true,
        }).catch(() => {});
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────
//  Embed Builders
// ─────────────────────────────────────────────────────────────

function getAvailableCategories() {
  return meta.CATEGORIES.filter((c) => meta.byCategory(c).length > 0);
}

function calcTotalPages(cat) {
  const cmds = meta.byCategory(cat);
  if (!cmds.length) return 1;
  return Math.max(1, Math.ceil(cmds.length / COMMANDS_PER_PAGE));
}

/**
 * Builds the Home Help Embed matching Rainy Assistant reference style.
 */
function buildHomeEmbed(client, prefix, user) {
  const totalCmds = meta.total();
  const availableCats = getAvailableCategories();
  const totalCats = availableCats.length;
  const username = user?.username || 'there';

  const desc = [
    `🤖 **Type ${prefix}help for more Info**\n`,
    `«Total Commands: ${totalCmds}`,
    `Categories: ${totalCats}»\n`,
    `━━━━━━━━━━━━━━━━━━━━\n`,
    `👑 **Hey ${username}!**\n`,
    `I'm **Pixel Assistant**, your friendly companion.\n`,
    `Prefix for this server: \`${prefix}\`\n`,
    `Pick from the menu below to continue!`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(config.embedColor || 0x5865F2)
    .setTitle('Help Menu')
    .setDescription(desc)
    .setFooter(makeFooter());

  if (client?.user?.displayAvatarURL) {
    embed.setThumbnail(client.user.displayAvatarURL({ dynamic: true }));
  }

  return embed;
}

/**
 * Builds Category Help Embed matching Rainy Assistant reference style.
 */
function buildCategoryEmbed(client, cat, page, totalPages, prefix) {
  const cmds = meta.byCategory(cat).sort((a, b) => a.name.localeCompare(b.name));
  const total = cmds.length;
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * COMMANDS_PER_PAGE;
  const slice = cmds.slice(start, start + COMMANDS_PER_PAGE);

  const displayName = DISPLAY[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);

  const commandLines = slice.map((c) => {
    return `«"${prefix}${c.name}" — ${c.description || 'No description.'}»`;
  });

  const desc = [
    commandLines.join('\n\n'),
    '\n━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(config.embedColor || 0x5865F2)
    .setTitle(`${displayName} Commands • Page ${safePage + 1}/${totalPages}`)
    .setDescription(desc)
    .setFooter(makeFooter());

  if (client?.user?.displayAvatarURL) {
    embed.setThumbnail(client.user.displayAvatarURL({ dynamic: true }));
  }

  return embed;
}

/**
 * Builds Detailed Command Embed when user types `?help <command>`
 */
function buildCommandDetailEmbed(m, prefix) {
  const subList = subs.get(m.name);
  const aliasesStr = m.aliases && m.aliases.length ? m.aliases.map((a) => `\`${a}\``).join(', ') : 'None';
  const permsStr = m.permissions && m.permissions.length ? m.permissions.map((p) => `\`${p}\``).join(', ') : 'None';
  const displayName = DISPLAY[m.category] || m.category;
  const emoji = EMOJI[m.category] || '📌';

  const embed = new EmbedBuilder()
    .setColor(config.embedColor || 0x5865F2)
    .setTitle(`${emoji} Command: ${prefix}${m.name}`)
    .setDescription(`> ${m.description || 'No description provided.'}`)
    .addFields(
      { name: '📂 Category', value: `\`${displayName}\``, inline: true },
      { name: '⏱ Cooldown', value: `\`${m.cooldown || 3}s\``, inline: true },
      { name: '🔒 Permissions', value: permsStr, inline: true },
      { name: '🏷 Aliases', value: aliasesStr, inline: true },
      { name: '👑 Owner Only', value: m.ownerOnly ? '`Yes`' : '`No`', inline: true },
      { name: '⚡ Slash Support', value: m.slash ? '`Enabled`' : '`Prefix Only`', inline: true },
      { name: '📖 Usage Syntax', value: `\`\`\`${prefix}${m.name}${m.usage ? ' ' + m.usage : ''}\`\`\``, inline: false },
    )
    .setFooter(makeFooter());

  if (subList.length > 0) {
    const SUBS_PER_FIELD = 8;
    for (let i = 0; i < subList.length; i += SUBS_PER_FIELD) {
      const chunk = subList.slice(i, i + SUBS_PER_FIELD);
      const label = subList.length > SUBS_PER_FIELD ? `🧩 Sub-commands (${i + 1}-${i + chunk.length})` : '🧩 Sub-commands';
      const value = chunk.map((s) => `• \`${prefix}${m.name} ${s.name}\` — ${s.description}`).join('\n');
      embed.addFields({ name: label, value, inline: false });
    }
  }

  return embed;
}

// ─────────────────────────────────────────────────────────────
//  Component Builders (Dropdown + 5-Button Pagination)
// ─────────────────────────────────────────────────────────────

function makeDropdown(selectedCat = null) {
  const availableCats = getAvailableCategories();

  const options = [
    {
      label: 'Home',
      value: 'home',
      description: 'Return to the main help overview',
      emoji: '🏠',
      default: selectedCat === null || selectedCat === 'home',
    },
  ];

  for (const c of availableCats) {
    options.push({
      label: DISPLAY[c] || c,
      value: c,
      description: (DESC[c] || `${DISPLAY[c]} commands`).slice(0, 100),
      emoji: EMOJI[c] || '📌',
      default: selectedCat === c,
    });
  }

  const placeholder = selectedCat && DISPLAY[selectedCat]
    ? `${EMOJI[selectedCat] || ''} ${DISPLAY[selectedCat]}`.trim()
    : 'Home ▼';

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder(placeholder)
      .addOptions(options)
  );
}

function makePaginationButtons(cat, page, totalPages) {
  const isHome = cat === null || cat === 'home';
  const isSinglePage = totalPages <= 1;

  const firstDisabled = isHome || isSinglePage || page === 0;
  const prevDisabled = isHome || isSinglePage || page === 0;
  const nextDisabled = isHome || isSinglePage || page >= totalPages - 1;
  const lastDisabled = isHome || isSinglePage || page >= totalPages - 1;

  const displayPage = isHome ? '1/1' : `${page + 1}/${totalPages}`;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_first')
      .setLabel('⏪')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId('help_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId('help_page')
      .setLabel(displayPage)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(nextDisabled),
    new ButtonBuilder()
      .setCustomId('help_last')
      .setLabel('⏩')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(lastDisabled)
  );
}

function makeRows(cat, page, totalPages) {
  const rows = [];
  rows.push(makeDropdown(cat));
  rows.push(makePaginationButtons(cat, page, totalPages));
  return rows;
}

function err(text) {
  return new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${text}`).setFooter(makeFooter());
}
