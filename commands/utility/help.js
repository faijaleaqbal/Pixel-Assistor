// src/commands/utility/help.js
// Help command — live, reusable dropdown + paginated embeds + slash command support.

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandOptionType } = require('discord.js');
const config = require('../../utils/config');
const meta = require('../../utils/commandMeta');
const { EMOJI, DISPLAY, DESC } = require('../../utils/categories');
const { ownerName } = require('../../utils/embeds');
const { getPrefix } = require('../../utils/prefixCache');
const logger = require('../../utils/logger');
const subs = require('../../utils/subcommands');

const state = new Map(); // messageId -> { category, page, total, prefix }

module.exports = {
  name: 'help',
  category: 'utility',
  aliases: ['h', 'commands'],
  description: 'Explore the full command list with categorized navigation and interactive search.',
  usage: '[command]',
  cooldown: 3,
  slash: true,
  slashOptions: [
    {
      name: 'command',
      description: 'Command name to view detailed syntax and subcommands',
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
        return message.reply({ embeds: [err(`No command found matching \`${args[0]}\`.\nType \`${currentPrefix}help\` to browse all categories.`)] });
      }
      return message.reply({ embeds: [await buildCommandDetailEmbed(client, m, currentPrefix)] });
    }

    // ?help -> Home overview
    const home = await buildHomeEmbed(client, currentPrefix);
    const rows = makeRows(null, 0, 1);
    const sent = await message.reply({ embeds: [home], components: rows });
    state.set(sent.id, { category: null, page: 0, total: 1, prefix: currentPrefix });

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
      return interaction.reply({ embeds: [await buildCommandDetailEmbed(client, m, currentPrefix)] });
    }

    const home = await buildHomeEmbed(client, currentPrefix);
    const rows = makeRows(null, 0, 1);
    const sent = await interaction.reply({ embeds: [home], components: rows, fetchReply: true });
    state.set(sent.id, { category: null, page: 0, total: 1, prefix: currentPrefix });

    const cleanupHandle = setTimeout(() => state.delete(sent.id), 30 * 60 * 1000);
    if (typeof cleanupHandle.unref === 'function') cleanupHandle.unref();
  },

  // ── Central interaction router (called from interactionCreate.js) ──
  async handleInteraction(interaction, client) {
    try {
      const currentPrefix = await getPrefix(interaction.guildId);

      // Category dropdown selected
      if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
        const cat = interaction.values[0];
        const totalPages = calcTotalPages(cat, currentPrefix);
        let st = state.get(interaction.message.id) || { category: null, page: 0, total: 1, prefix: currentPrefix };
        st.category = cat;
        st.page = 0;
        st.total = totalPages;
        st.prefix = currentPrefix;
        state.set(interaction.message.id, st);

        return interaction.update({
          embeds: [await buildCategoryEmbed(client, cat, 0, currentPrefix)],
          components: makeRows(cat, 0, totalPages),
        });
      }

      // Buttons clicked (Home / Prev / Next)
      if (interaction.isButton()) {
        const id = interaction.customId;
        let st = state.get(interaction.message.id) || { category: null, page: 0, total: 1, prefix: currentPrefix };

        if (id === 'help_home' || !st.category) {
          st.category = null;
          st.page = 0;
          st.total = 1;
          state.set(interaction.message.id, st);
          return interaction.update({
            embeds: [await buildHomeEmbed(client, currentPrefix)],
            components: makeRows(null, 0, 1),
          });
        }

        if (id === 'help_prev') {
          st.page = Math.max(0, st.page - 1);
        } else if (id === 'help_next') {
          st.page = Math.min(st.total - 1, st.page + 1);
        }

        state.set(interaction.message.id, st);
        return interaction.update({
          embeds: [await buildCategoryEmbed(client, st.category, st.page, currentPrefix)],
          components: makeRows(st.category, st.page, st.total),
        });
      }
    } catch (e) {
      logger.error('help interaction error', e?.message || e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Help menu update error: ' + (e?.message || 'unknown'), ephemeral: true }).catch(() => {});
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────
//  Embed Builders & Helpers
// ─────────────────────────────────────────────────────────────

async function makeFooter(client) {
  const author = await ownerName(client);
  return { text: `Developed by ${author} • Pixel Assistor v1.0` };
}

async function buildHomeEmbed(client, prefix) {
  const counts = meta.categoryCounts();
  const totalCmds = meta.total();
  const allSubCmds = subs.allCommandsWithSubs().reduce((acc, c) => acc + subs.get(c).length, 0);
  const latency = Math.max(0, Math.round(client.ws.ping));
  const guilds = client.guilds.cache.size;

  const fields = meta.CATEGORIES.map((c) => ({
    name: `${EMOJI[c]} ${DISPLAY[c]}  \`(${counts[c] || 0})\``,
    value: `> ${DESC[c] || 'No description.'}`,
    inline: true,
  }));

  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle('📚 Pixel Assistor — Command Hub')
    .setDescription(
      `Welcome to **Pixel Assistor**! Choose a category from the dropdown below to explore commands.\n\n` +
      `**Server Prefix:** \`${prefix}\` • **Slash Commands:** \`/help\`\n` +
      `**Stats:** \`⚡ ${latency}ms\` • \`🌐 ${guilds} Guilds\` • \`📦 ${totalCmds} Commands\` • \`🧩 ${allSubCmds} Sub-commands\`\n\n` +
      `💡 **Quick Tip:** Use \`${prefix}help <command>\` or \`/help command:<name>\` for syntax & examples.`
    )
    .addFields(fields)
    .setFooter(await makeFooter(client))
    .setTimestamp();
}

async function buildCommandDetailEmbed(client, m, prefix) {
  const subList = subs.get(m.name);
  const aliasesStr = m.aliases && m.aliases.length ? m.aliases.map((a) => `\`${a}\``).join(', ') : 'None';
  const permsStr = m.permissions && m.permissions.length ? m.permissions.map((p) => `\`${p}\``).join(', ') : 'None';

  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`${EMOJI[m.category] || '📌'} Command: ${m.name}`)
    .setDescription(`> ${m.description || 'No description provided.'}`)
    .addFields(
      { name: '📂 Category', value: `\`${DISPLAY[m.category] || m.category}\``, inline: true },
      { name: '⏱ Cooldown', value: `\`${m.cooldown || 3}s\``, inline: true },
      { name: '🔒 Permissions', value: permsStr, inline: true },
      { name: '🏷 Aliases', value: aliasesStr, inline: true },
      { name: '👑 Owner Only', value: m.ownerOnly ? '`Yes`' : '`No`', inline: true },
      { name: '⚡ Slash Support', value: m.slash ? '`Enabled`' : '`Prefix Only`', inline: true },
      { name: '📖 Usage Syntax', value: `\`\`\`${prefix}${m.name}${m.usage ? ' ' + m.usage : ''}\`\`\``, inline: false },
    );

  if (subList.length > 0) {
    const SUBS_PER_FIELD = 8;
    for (let i = 0; i < subList.length; i += SUBS_PER_FIELD) {
      const chunk = subList.slice(i, i + SUBS_PER_FIELD);
      const label = subList.length > SUBS_PER_FIELD ? `🧩 Sub-commands (${i + 1}-${i + chunk.length})` : '🧩 Sub-commands';
      const value = chunk.map((s) => `• \`${prefix}${m.name} ${s.name}\` — ${s.description}`).join('\n');
      e.addFields({ name: label, value, inline: false });
    }
  }

  e.setFooter(await makeFooter(client)).setTimestamp();
  return e;
}

function pickShortAlias(aliases) {
  if (!aliases || !aliases.length) return null;
  return aliases.reduce((best, a) => (a.length < best.length ? a : best), aliases[0]);
}

function buildCmdLine(c, prefix) {
  const cmdPart = `\`${prefix}${c.name}${c.usage ? ' ' + c.usage : ''}\``;
  const shortAlias = pickShortAlias(c.aliases);
  if (shortAlias) {
    return `${cmdPart} *(alias \`${shortAlias}\`)*\n> ${c.description}`;
  }
  return `${cmdPart}\n> ${c.description}`;
}

function buildSubLines(c, prefix) {
  const subList = subs.get(c.name);
  if (!subList || subList.length === 0) return '';
  const show = subList.slice(0, 2);
  const remaining = subList.length - show.length;
  let lines = show.map((s) => `  ├─ \`${s.name}\` — *${s.description}*`).join('\n');
  if (remaining > 0) {
    lines += `\n  └─ ... +${remaining} more (\`${prefix}help ${c.name}\`)`;
  }
  return lines;
}

function calcPageSize(cmds, prefix) {
  const MAX_DESC = 3800;
  const entries = cmds.map((c) => {
    let entry = buildCmdLine(c, prefix);
    const subLines = buildSubLines(c, prefix);
    if (subLines) entry += '\n' + subLines;
    return entry;
  });

  for (let ps = 8; ps >= 3; ps--) {
    let fits = true;
    for (let p = 0; p * ps < cmds.length; p++) {
      const pageEntries = entries.slice(p * ps, (p + 1) * ps);
      const descLen = pageEntries.join('\n\n').length + 100;
      if (descLen > MAX_DESC) {
        fits = false;
        break;
      }
    }
    if (fits) return ps;
  }
  return 3;
}

function calcTotalPages(cat, prefix) {
  const cmds = meta.byCategory(cat);
  if (!cmds.length) return 1;
  const ps = calcPageSize(cmds, prefix);
  return Math.max(1, Math.ceil(cmds.length / ps));
}

async function buildCategoryEmbed(client, cat, page, prefix) {
  const cmds = meta.byCategory(cat).sort((a, b) => a.name.localeCompare(b.name));
  const total = cmds.length;
  const pageSize = calcPageSize(cmds, prefix);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const slice = cmds.slice(start, start + pageSize);

  const lines = slice.map((c) => {
    let line = buildCmdLine(c, prefix);
    const subLines = buildSubLines(c, prefix);
    if (subLines) line += '\n' + subLines;
    return line;
  });

  const header = `**${DESC[cat] || 'Category commands.'}**\n*Showing ${start + 1}–${Math.min(start + pageSize, total)} of ${total} commands:*\n\n`;
  const desc = header + lines.join('\n\n');

  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`${EMOJI[cat]} ${DISPLAY[cat]} Commands — Page ${safePage + 1}/${totalPages}`)
    .setDescription(desc)
    .setFooter(await makeFooter(client))
    .setTimestamp();
}

function makeDropdown() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('📂 Browse Category Commands…')
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

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_home')
      .setLabel('Home')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('help_prev')
      .setLabel('Prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(cat === null || page === 0),
    new ButtonBuilder()
      .setCustomId('help_page')
      .setLabel(`Page ${cat === null ? 1 : page + 1} / ${cat === null ? 1 : totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel('Next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(cat === null || page >= totalPages - 1)
  );

  rows.push(navRow);
  return rows;
}

function err(text) {
  return new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${text}`).setTimestamp();
}
