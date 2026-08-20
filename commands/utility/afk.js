const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/afk.js

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getDb } = require('../../utils/db');

/**
 * Activate AFK with the given settings and return the final embed.
 */
async function activateAfk(message, reason, dmOnMention) {
  const now = Date.now();
  await getDb().afk.set(message.author.id, message.guild.id, reason, now, dmOnMention);
  try { await message.member?.setNickname(`[AFK] ${message.member.nickname || message.author.username}`).catch(() => {}); } catch {}

  const unixSec = Math.floor(now / 1000);
  const embed = responseBuilder.buildResult({ title: 'AFK Activated', description: `> Reason: ${reason}\n> DM on mentions: ${dmOnMention ? 'Yes' : 'No'}\n> Time set: <t:${unixSec}:R>`});

  return { embed, components: [] };
}

module.exports = {
  name: 'afk',
  aliases: ['away'],
  category: 'utility',
  description: 'Set your AFK status with interactive DM-notify prompt.',
  usage: '[reason] | dm on | dm off | clear',
  cooldown: 3,
  async execute(message, args, client) {
    const db = getDb();
    const lower = args.map((a) => a.toLowerCase());

    // ── ?afk dm on ──
    if (lower[0] === 'dm' && lower[1] === 'on') {
      const existing = await db.afk.get(message.author.id, message.guild.id);
      if (!existing) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: 'You\'re not currently AFK. Use `?afk <reason>` to go AFK first.'})] });
      }
      await db.afk.setDm(message.author.id, message.guild.id, true);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '✅ DM on mentions **enabled**.'})] });
    }

    // ── ?afk dm off ──
    if (lower[0] === 'dm' && lower[1] === 'off') {
      const existing = await db.afk.get(message.author.id, message.guild.id);
      if (!existing) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: 'You\'re not currently AFK. Use `?afk <reason>` to go AFK first.'})] });
      }
      await db.afk.setDm(message.author.id, message.guild.id, false);
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '✅ DM on mentions **disabled**.'})] });
    }

    // ── ?afk clear ──
    if (lower[0] === 'clear') {
      const removed = await db.afk.remove(message.author.id, message.guild.id);
      if (!removed) {
        return message.reply({ embeds: [responseBuilder.buildResult({ description: 'You\'re not currently AFK.'})] });
      }
      try { await message.member?.setNickname(message.member.nickname?.replace(/^\[AFK\]\s*/, '')).catch(() => {}); } catch {}
      return message.reply({ embeds: [responseBuilder.buildResult({ description: '✅ Your AFK status has been cleared.'})] });
    }

    // ── ?afk [reason] — interactive Yes/No button flow ──
    const reason = args.join(' ') || 'AFK';

    // If the user is already AFK in this guild, update their reason directly (no buttons again)
    const existing = await db.afk.get(message.author.id, message.guild.id);
    if (existing) {
      const now = Date.now();
      const dmVal = existing.dmOnMention;
      const dmBool = typeof dmVal === 'number' ? dmVal === 1 : !!dmVal;
      await db.afk.set(message.author.id, message.guild.id, reason, now, dmBool);
      const unixSec = Math.floor(now / 1000);
      const embed = responseBuilder.buildResult({ title: 'AFK Updated', description: `> Reason: ${reason}\n> DM on mentions: ${dmBool ? 'Yes' : 'No'}\n> Time set: <t:${unixSec}:R>`});
      return message.reply({ embeds: [embed] });
    }

    // Step 1: Send the "AFK Settings" embed with Yes/No buttons
    // Use unique customIds per-invocation so the global interactionCreate
    // handler can identify and defer to this collector.
    const uid = message.author.id;
    const yesId = `afk_${uid}_yes`;
    const noId = `afk_${uid}_no`;

    const settingsEmbed = responseBuilder.buildResult({ title: 'AFK Settings', description: `> User: <@${uid}>\n> Reason: ${reason}\n\nShould I DM you when you're mentioned?`});

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(yesId)
        .setLabel('Yes')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(noId)
        .setLabel('No')
        .setStyle(ButtonStyle.Secondary),
    );

    const promptMsg = await message.reply({ embeds: [settingsEmbed], components: [row] });

    // Step 2: Collector on the exact message that was sent
    const collector = promptMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.customId === yesId || i.customId === noId,
      time: 60_000,
    });

    collector.on('collect', async (interaction) => {
      // Extra guard: only the command author can press these buttons
      if (interaction.user.id !== uid) {
        return interaction.reply({ content: "This isn't for you.", ephemeral: true });
      }

      const dmOnMention = interaction.customId === yesId;

      // Write AFK to DB
      await activateAfk(message, reason, dmOnMention);

      // Verify write-back
      try {
        const verify = await db.afk.get(uid, message.guild.id);
        if (!verify) {
          console.error(`[AFK BUG] DB write-back verify FAILED for user ${uid} in guild ${message.guild.id}`);
        }
      } catch (e) {
        console.error(`[AFK BUG] DB write-back verify error:`, e.message);
      }

      // Update the embed in-place (interaction.update, NOT reply)
      const unixSec = Math.floor(Date.now() / 1000);
      const activatedEmbed = responseBuilder.buildResult({ title: 'AFK Activated', description: `> Reason: ${reason}\n> DM on mentions: ${dmOnMention ? 'Yes' : 'No'}\n> Time set: <t:${unixSec}:R>`});

      await interaction.update({ embeds: [activatedEmbed], components: [] });
    });

    collector.on('end', async (collected, endReason) => {
      if (endReason === 'time' && collected.size === 0) {
        // Timeout — default to DM-notify OFF and activate AFK
        const { embed, components } = await activateAfk(message, reason, false);
        try {
          await promptMsg.edit({ embeds: [embed], components });
        } catch {
          // Message may have been deleted
        }
      }
    });
  },
};
