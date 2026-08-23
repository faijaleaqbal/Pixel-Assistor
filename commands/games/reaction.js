const responseBuilder = require('../../utils/responseBuilder');
// src/commands/games/reaction.js
// Reaction speed game. Bot sends an embed that randomly changes color/emote after
// a delay. First user to react with the correct emote wins.
//
// Persistence: reactionStat table (wins per guild).

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getDb } = require('../../utils/db');
const { opts } = require('../../utils/v2Reply');

const EMOJIS = ['🎯', '🔥', '⚡', '🌟', '💎', '🚀'];

module.exports = {
  name: 'reaction',
  category: 'games',
  aliases: ['rc'],
  description: 'Reaction speed game — first to react wins!',
  usage: '',
  cooldown: 5,
  async execute(message) {
    const targetEmoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const waitMs = 2000 + Math.floor(Math.random() * 5000);

    const waiting = responseBuilder.buildResult({ title: '⚡ Reaction game', description: `React with ${targetEmoji} as soon as the embed changes!\n_Get ready…_`});

    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('react_wait').setLabel('Get ready…').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    const sent = await message.reply(opts(waiting.addActionRowComponents(btn)));

    const waitHandle = setTimeout(async () => {
      try {
        const renderGo = () => responseBuilder.buildResult({ title: '🟢 GO!', description: `React with ${targetEmoji} NOW!`});
        const goBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`react_go_${targetEmoji}`).setLabel('React!').setEmoji(targetEmoji).setStyle(ButtonStyle.Primary),
        );
        await sent.edit(opts(renderGo().addActionRowComponents(goBtn)));

        const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10000 });
        let won = false;
        collector.on('collect', async (i) => {
          try {
            if (won) return;
            won = true;
            await getDb().reactionStat.inc(i.user.id, message.guild.id);
            await i.reply(opts(responseBuilder.buildResult({ description: `🎉 <@${i.user.id}> won!`}), { allowedMentions: { parse: [] } }));
            collector.stop('won');
          } catch (e) { console.error('[reaction] collector error:', e.message); }
        });
        collector.on('end', async (_collected, reason) => {
          if (reason !== 'won') {
            await sent.edit(opts(responseBuilder.buildResult({ title: 'Time up', description: 'No one reacted in time.'}))).catch(() => {});
          } else {
            // V2 messages cannot be component-less; re-render the GO state without the button row.
            await sent.edit(opts(renderGo())).catch(() => {});
          }
        });
      } catch { /* ignore */ }
    }, waitMs);
    if (typeof waitHandle.unref === 'function') waitHandle.unref();
  },

  async handleButton(interaction) {
    if (!interaction.replied) await interaction.deferUpdate().catch(() => {});
  },
};
