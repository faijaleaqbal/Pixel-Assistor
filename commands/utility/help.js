// src/commands/utility/help.js
// Help command — Rainy Assistant style UI redesign for Pixel Assistant.
// Clean, compact, paginated Components V2 interface with dropdown navigation.

const {
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
const { safeUpdate } = require('../../utils/interactionHelper');
const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');

// State map: messageId -> { userId, username, category, page, total, prefix }
const state = new Map();

const COMMANDS_PER_PAGE = 7;
const HELP_COLOR = config.embedColor || 0x7C3AED;

function makeFooter() {
  const devName = config.helpFooterName || 'Developer';
  return `-# Developed by ${devName}`;
}

// Attaches the dropdown + pagination rows INSIDE a V2 container and wraps in payload opts.
function withRows(container, cat, page, totalPages, extra = {}) {
  return opts(container.addActionRowComponents(...makeRows(cat, page, totalPages)), extra);
}

function compactDescription(str, max = 80) {
  if (!str) return 'No description provided.';
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
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
  buildHomeContent,
  buildCategoryContent,
  buildCommandDetailEmbed,
  getAvailableCategories,
  calcTotalPages,
  compactDescription,

  // ── Prefix execution (?help / ?help <command>) ──
  async execute(message, args, client) {
    const currentPrefix = await getPrefix(message.guild?.id);

    // ?help <command>
    if (args[0]) {
      const m = meta.get(args[0].toLowerCase());
      if (!m) {
        return message.reply(opts(
          err(`No command found matching \`${args[0]}\`.\nType \`${currentPrefix}help\` to browse all categories.`),
        ));
      }
      return message.reply(opts(buildCommandDetailEmbed(m, currentPrefix)));
    }

    // ?help -> Home overview
    const user = message.author;
    const home = buildHomeContent(client, currentPrefix, user);
    const sent = await message.reply(withRows(home, null, 0, 1));

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
        return interaction.reply(opts(
          err(`No command found matching \`${cmdName}\`.\nUse \`/help\` to browse all categories.`),
          { ephemeral: true },
        ));
      }
      return interaction.reply(opts(buildCommandDetailEmbed(m, currentPrefix)));
    }

    const user = interaction.user;
    const home = buildHomeContent(client, currentPrefix, user);
    const sent = await interaction.reply(withRows(home, null, 0, 1, { fetchReply: true }));

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
        return interaction.reply(opts(
          buildContainer({ description: "This Help Menu isn't yours.", color: '#ED4245' }),
          { ephemeral: true },
        ));
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
          const homeContent = buildHomeContent(client, currentPrefix, interaction.user);
          return safeUpdate(interaction, withRows(homeContent, null, 0, 1));
        }

        const totalPages = calcTotalPages(selected);
        st.category = selected;
        st.page = 0;
        st.total = totalPages;
        st.prefix = currentPrefix;
        state.set(messageId, st);

        const catContent = buildCategoryContent(client, selected, 0, totalPages, currentPrefix);
        return safeUpdate(interaction, withRows(catContent, selected, 0, totalPages));
      }

      // Buttons clicked (First / Prev / Next / Last / Home)
      if (interaction.isButton()) {
        const id = interaction.customId;

        if (id === 'help_home' || !st.category) {
          st.category = null;
          st.page = 0;
          st.total = 1;
          state.set(messageId, st);

          const homeContent = buildHomeContent(client, currentPrefix, interaction.user);
          return safeUpdate(interaction, withRows(homeContent, null, 0, 1));
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
        const catContent = buildCategoryContent(client, st.category, st.page, totalPages, currentPrefix);
        return safeUpdate(interaction, withRows(catContent, st.category, st.page, totalPages));
      }
    } catch (e) {
      logger.error('help interaction error', e?.message || e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply(opts(
          buildContainer({ description: 'Help menu error: ' + (e?.message || 'unknown'), color: '#ED4245' }),
          { ephemeral: true },
        )).catch(() => {});
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────
//  Container Builders (Components V2)
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
 * Builds the Home Help page as a Components V2 container (Rainy Assistant style).
 * Uses "# " H1, "-# " subtext markdown, custom emojis, and a dynamic <t:unix:f> timestamp.
 */
function buildHomeContent(client, prefix, user) {
  const totalCmds = meta.total();
  const totalCats = getAvailableCategories().length;
  const botName = client?.user?.username || 'Pixel-Assistor';
  const devName = config.helpFooterName || 'Developer';
  const E = config.helpEmojis;
  const ts = Math.floor(Date.now() / 1000);

  const userLine = user?.id
    ? `**[${user.username || 'there'}](https://discord.com/users/${user.id})**`
    : `**${user?.username || 'there'}**`;

  const body = [
    '### Help Menu',
    `${E.automod} Type **${prefix}help** for more Info`,
    `-# ${E.spacer}${E.chevron} Total Commands: **${totalCmds}**`,
    `-# ${E.spacer}${E.chevron} Categories: **${totalCats}**`,
    `${E.king} Hey ${userLine}!`,
    `I'm *${botName}*, your friendly companion.`,
    `-# ${E.spacer} Prefix for this server: **${prefix}**`,
    `-# ${E.spacer} Pick from the menu below to continue!`,
    `-# Developed by ${devName} • <t:${ts}:f>`,
  ].join('\n');

  return buildContainer({ description: body, color: HELP_COLOR });
}

/**
 * Builds a Category Help page as a Components V2 container.
 * Every command line starts with the spacer + chevron emoji bullets.
 */
function buildCategoryContent(client, cat, page, totalPages, prefix) {
  const cmds = meta.byCategory(cat).sort((a, b) => a.name.localeCompare(b.name));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * COMMANDS_PER_PAGE;
  const slice = cmds.slice(start, start + COMMANDS_PER_PAGE);

  const displayName = DISPLAY[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
  const devName = config.helpFooterName || 'Developer';
  const E = config.helpEmojis;
  const ts = Math.floor(Date.now() / 1000);
  const header = `# ${displayName} Commands  •  Page ${safePage + 1}/${totalPages}`;

  if (!slice.length) {
    return buildContainer({
      description: [header, 'No commands available in this category.', `-# Developed by ${devName} • <t:${ts}:f>`].join('\n'),
      color: HELP_COLOR,
    });
  }

  const lines = slice.map((c) => {
    const tag = subs.get(c.name).length > 0 ? ' **[Group]**' : '';
    const d = c.description ? compactDescription(c.description, 80) : 'No description provided.';
    return `${E.spacer}${E.chevron} \`${prefix}${c.name}\`${tag} — ${d}`;
  });

  const body = [header, ...lines, '', `-# Developed by ${devName} • <t:${ts}:f>`].join('\n');
  return buildContainer({ description: body, color: HELP_COLOR });
}

/**
 * Builds Detailed Command container when user types `?help <command>`
 */
function buildCommandDetailEmbed(m, prefix) {
  const subList = subs.get(m.name);
  const aliasesStr = m.aliases && m.aliases.length ? m.aliases.map((a) => `\`${a}\``).join(', ') : 'None';
  const permsStr = m.permissions && m.permissions.length ? m.permissions.map((p) => `\`${p}\``).join(', ') : 'None';
  const displayName = DISPLAY[m.category] || m.category;
  const emoji = EMOJI[m.category] || '📌';

  const fields = [
    { name: '📂 Category', value: `\`${displayName}\`` },
    { name: '⏱ Cooldown', value: `\`${m.cooldown || 3}s\`` },
    { name: '🔒 Permissions', value: permsStr },
    { name: '🏷 Aliases', value: aliasesStr },
    { name: '👑 Owner Only', value: m.ownerOnly ? '`Yes`' : '`No`' },
    { name: '⚡ Slash Support', value: m.slash ? '`Enabled`' : '`Prefix Only`' },
    `\`\`\`${prefix}${m.name}${m.usage ? ' ' + m.usage : ''}\`\`\``,
  ];

  if (subList.length > 0) {
    const SUBS_PER_FIELD = 8;
    for (let i = 0; i < subList.length; i += SUBS_PER_FIELD) {
      const chunk = subList.slice(i, i + SUBS_PER_FIELD);
      const label = subList.length > SUBS_PER_FIELD ? `🧩 Sub-commands (${i + 1}-${i + chunk.length})` : '🧩 Sub-commands';
      const value = chunk.map((s) => `• \`${prefix}${m.name} ${s.name}\` — ${s.description}`).join('\n');
      fields.push({ name: label, value });
    }
  }

  const body = [
    `### ${emoji} Command: ${prefix}${m.name}`,
    `> ${m.description || 'No description provided.'}`,
  ].join('\n');

  return buildContainer({
    description: body,
    fields,
    color: HELP_COLOR,
    customFooter: makeFooter(),
  });
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
      default: selectedCat === null || selectedCat === 'home',
    },
  ];

  for (const c of availableCats) {
    options.push({
      label: DISPLAY[c] || c,
      value: c,
      description: (DESC[c] || `${DISPLAY[c]} commands`).slice(0, 100),
      default: selectedCat === c,
    });
  }

  const placeholder = selectedCat && DISPLAY[selectedCat]
    ? DISPLAY[selectedCat]
    : 'Home';

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
      .setLabel('<<')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId('help_prev')
      .setLabel('<')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId('help_page')
      .setLabel(displayPage)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel('>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(nextDisabled),
    new ButtonBuilder()
      .setCustomId('help_last')
      .setLabel('>>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(lastDisabled)
  );
}

// Home shows only the dropdown; pagination row appears only inside a category.
function makeRows(cat, page, totalPages) {
  const rows = [makeDropdown(cat)];
  if (cat && cat !== 'home') rows.push(makePaginationButtons(cat, page, totalPages));
  return rows;
}

function err(text) {
  return responseBuilder.buildError({ title: 'Help Menu', error: text });
}
