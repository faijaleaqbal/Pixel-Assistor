// src/commands/utility/help.js
// Help command — live, reusable dropdown + paginated embeds.
//
// HELP MENU FIX (per spec):
//   The dropdown must STAY LIVE after a category is picked, so the user can
//   immediately pick another category without re-running ?help.
//
// Implementation:
//   1. ?help sends a message containing:
//        - a home embed (category counts + total)
//        - a StringSelectMenu with id `help_category_select`
//   2. interactionCreate (events/interactionCreate.js) routes ANY select-menu
//      interaction with customId === 'help_category_select' back to this file's
//      default export, which rebuilds the embed for the chosen category and
//      edits the SAME message in place (interaction.update), keeping the
//      dropdown live forever.
//   3. The Prev/Next buttons use id prefixes `help_prev` / `help_next` and are
//      also routed back here from interactionCreate. They page within the
//      currently-selected category and keep the dropdown live.

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../utils/config');
const meta = require('../../utils/commandMeta');
const { EMOJI, DISPLAY, DESC } = require('../../utils/categories');
const { ownerName } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const subs = require('../../utils/subcommands');

const state = new Map(); // messageId -> { category, page, total }

module.exports = {
  name: 'help',
  category: 'utility',
  description: 'Shows the interactive command menu with category dropdown + pagination.',
  usage: '[command]',
  cooldown: 5,
  async execute(message, args, client) {
    // ?help <command> -> show one command's detail
    if (args[0]) {
      const m = meta.get(args[0].toLowerCase());
      if (!m) return message.reply({ embeds: [err(`No such command: \`${args[0]}\`.`)] });
      return message.reply({ embeds: [await buildCommandDetailEmbed(client, m)] });
    }

    // ?help -> home menu
    const home = await buildHomeEmbed(client);
    const row = makeDropdown();
    const sent = await message.reply({ embeds: [home], components: [row] });
    state.set(sent.id, { category: null, page: 0, total: 0 });
    // Self-clean state after 30 minutes to avoid unbounded memory growth.
    const cleanupHandle = setTimeout(() => state.delete(sent.id), 30 * 60 * 1000);
    if (typeof cleanupHandle.unref === 'function') cleanupHandle.unref();
  },

  // Called from interactionCreate for BOTH dropdown picks and Prev/Next buttons.
  async handleInteraction(interaction, client) {
    try {
      if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
        const cat = interaction.values[0];
        const cmds = meta.byCategory(cat);
        const totalPages = calcTotalPages(cat);
        let st = state.get(interaction.message.id) || { category: null, page: 0 };
        st.category = cat;
        st.page = 0;
        st.total = totalPages;
        state.set(interaction.message.id, st);
        return interaction.update({ embeds: [await buildCategoryEmbed(client, cat, 0)], components: makeRows(cat, 0, totalPages) });
      }

      if (interaction.isButton()) {
        const id = interaction.customId;
        let st = state.get(interaction.message.id) || { category: null, page: 0, total: 1 };
        if (!st.category) {
          // No category yet — show home.
          return interaction.update({ embeds: [await buildHomeEmbed(client)], components: makeRows(null, 0, 1) });
        }
        if (id === 'help_prev') st.page = Math.max(0, st.page - 1);
        else if (id === 'help_next') st.page = Math.min(st.total - 1, st.page + 1);
        else if (id === 'help_home') {
          st.category = null; st.page = 0; st.total = 1;
          state.set(interaction.message.id, st);
          return interaction.update({ embeds: [await buildHomeEmbed(client)], components: makeRows(null, 0, 1) });
        }
        state.set(interaction.message.id, st);
        return interaction.update({
          embeds: [await buildCategoryEmbed(client, st.category, st.page)],
          components: makeRows(st.category, st.page, st.total),
        });
      }
    } catch (e) {
      logger.error('help interaction error', e?.message);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Help menu error: ' + (e?.message || 'unknown'), ephemeral: true }).catch(() => {});
      }
    }
  },
};

// ---------- Builders ----------

async function makeFooter(client) {
  return { text: `Developed by ${await ownerName(client)} • ${new Date().toLocaleString()}` };
}

async function buildHomeEmbed(client) {
  const counts = meta.categoryCounts();
  const total = meta.total();
  const subCount = subs.allCommandsWithSubs().length;
  const totalSubs = subs.allCommandsWithSubs().reduce((acc, c) => acc + subs.get(c).length, 0);
  const fields = meta.CATEGORIES.map((c) => ({
    name: `${EMOJI[c]} ${DISPLAY[c]}  —  ${counts[c] || 0}`,
    value: DESC[c] || '—',
  }));
  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle('📚 Pixel Exchange & MM Assistant — Help')
    .setDescription(
      `Pick a category from the dropdown below to browse commands.\n` +
      `**Total Commands:** ${total} | **Categories:** ${meta.CATEGORIES.length} | **Sub-commands:** ${totalSubs}\n\n` +
      `Tip: the dropdown stays live — switch categories freely.\n` +
      `Use \`${config.prefix}help <command>\` to see sub-commands.`
    )
    .addFields(fields)
    .setFooter(await makeFooter(client))
    .setTimestamp();
}

// Build detail embed for a single command (including subcommands)
async function buildCommandDetailEmbed(client, m) {
  const subList = subs.get(m.name);
  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`${EMOJI[m.category]} ${m.name}`)
    .setDescription(m.description)
    .addFields(
      { name: 'Category', value: DISPLAY[m.category], inline: true },
      { name: 'Cooldown', value: `${m.cooldown}s`, inline: true },
      { name: 'Usage', value: `\`${config.prefix}${m.name}${m.usage ? ' ' + m.usage : ''}\`` },
      { name: 'Aliases', value: (m.aliases && m.aliases.length) ? m.aliases.map((a) => `\`${a}\``).join(', ') : '—', inline: true },
      { name: 'Permissions', value: (m.permissions && m.permissions.length) ? m.permissions.join(', ') : '—', inline: true },
      { name: 'Owner Only', value: m.ownerOnly ? 'Yes' : 'No', inline: true },
    );

  // Add subcommands field if the command has them
  if (subList.length > 0) {
    // Discord embed field value limit is 1024 chars — split if needed
    const SUBS_PER_FIELD = 8;
    const chunks = [];
    for (let i = 0; i < subList.length; i += SUBS_PER_FIELD) {
      chunks.push(subList.slice(i, i + SUBS_PER_FIELD));
    }
    chunks.forEach((chunk, idx) => {
      const label = chunks.length > 1 ? `Sub-commands ${idx + 1}/${chunks.length}` : 'Sub-commands';
      const value = chunk.map((s) => `\`${s.name}\` — ${s.description}`).join('\n');
      e.addFields({ name: ` ├─ ${label}`, value, inline: false });
    });
  }

  e.setFooter(await makeFooter(client)).setTimestamp();
  return e;
}

/**
 * Pick the shortest alias to show in the compact help line.
 */
function pickShortAlias(aliases) {
  if (!aliases || !aliases.length) return null;
  return aliases.reduce((best, a) => a.length < best.length ? a : best, aliases[0]);
}

/**
 * Build a single-line help entry for a command.
 * With alias:   `?command [usage]` (alias `xx`) — description
 * Without:      `?command [usage]` — description
 */
function buildCmdLine(c) {
  const cmdPart = `\`${config.prefix}${c.name}${c.usage ? ' ' + c.usage : ''}\``;
  const shortAlias = pickShortAlias(c.aliases);
  if (shortAlias) {
    return `${cmdPart} (alias \`${shortAlias}\`) — ${c.description}`;
  }
  return `${cmdPart} — ${c.description}`;
}

/**
 * Build continuation lines for subcommands (if any).
 */
function buildSubLines(c) {
  const subList = subs.get(c.name);
  if (!subList || subList.length === 0) return '';
  const show = subList.slice(0, 3);
  const remaining = subList.length - show.length;
  let lines = show.map((s) => `  ├ \`${s.name}\``).join('\n');
  if (remaining > 0) {
    lines += `\n  └ ... +${remaining} more (\`${config.prefix}help ${c.name}\`)`;
  }
  return lines;
}

/**
 * Calculate how many commands fit on a single page for a given category,
 * respecting Discord's 4096-char embed description limit.
 * Returns the page size (number of commands per page).
 */
function calcPageSize(cmds) {
  const MAX_DESC = 4096;
  // Reserve space for category description header + blank lines
  const headerReserve = 80;
  // Build all command entries (main line + optional sub lines)
  const entries = cmds.map(c => {
    let entry = buildCmdLine(c);
    const subLines = buildSubLines(c);
    if (subLines) entry += '\n' + subLines;
    return entry;
  });

  // Find the largest page size where EVERY page fits
  for (let ps = 10; ps >= 3; ps--) {
    let fits = true;
    for (let p = 0; p * ps < cmds.length; p++) {
      const pageEntries = entries.slice(p * ps, (p + 1) * ps);
      const descLen = headerReserve + pageEntries.join('\n').length + 1;
      if (descLen > MAX_DESC) { fits = false; break; }
    }
    if (fits) return ps;
  }
  return 3; // absolute minimum
}

function calcTotalPages(cat) {
  const cmds = meta.byCategory(cat);
  if (!cmds.length) return 1;
  const ps = calcPageSize(cmds);
  return Math.max(1, Math.ceil(cmds.length / ps));
}

async function buildCategoryEmbed(client, cat, page) {
  const cmds = meta.byCategory(cat).sort((a, b) => a.name.localeCompare(b.name));
  const total = cmds.length;
  const pageSize = calcPageSize(cmds);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = page * pageSize;
  const slice = cmds.slice(start, start + pageSize);

  // Build description: one line per command (compact, tap-to-copy format)
  const lines = slice.map(c => {
    let line = buildCmdLine(c);
    const subLines = buildSubLines(c);
    if (subLines) line += '\n' + subLines;
    return line;
  });

  const desc = (DESC[cat] || '') + '\n\n' + lines.join('\n');

  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`${EMOJI[cat]} ${DISPLAY[cat]} — ${total} Commands • Page ${page + 1}/${totalPages}`)
    .setDescription(desc)
    .setFooter(await makeFooter(client))
    .setTimestamp();

  return e;
}

function makeDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('Select a category…')
      .addOptions(
        meta.CATEGORIES.map((c) => ({
          label: `${DISPLAY[c]} (${meta.byCategory(c).length})`,
          value: c,
          description: (DESC[c] || '').slice(0, 100),
          emoji: EMOJI[c],
        }))
      )
  );
}

function makeRows(cat, page, totalPages) {
  const rows = [];
  rows.push(makeDropdown());
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('help_home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(cat === null || page === 0),
    new ButtonBuilder().setCustomId('help_page').setLabel(`Page ${cat === null ? 1 : page + 1}/${cat === null ? 1 : totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('help_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(cat === null || page >= totalPages - 1),
  ));
  return rows;
}

function err(text) {
  return new EmbedBuilder().setColor(0xED4245).setDescription(text).setTimestamp();
}
