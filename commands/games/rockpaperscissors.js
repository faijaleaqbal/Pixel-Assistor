const responseBuilder = require('../../utils/responseBuilder');
// src/commands/games/rockpaperscissors.js
// Play RPS vs the bot OR challenge a member. Button-based, persistent stats.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getDb } = require('../../utils/db');
const { resolveUserArg } = require('../../utils/resolveUser');

const CHOICES = [
  { id: 'rock', emoji: '✊', label: 'Rock', beats: 'scissors' },
  { id: 'paper', emoji: '✋', label: 'Paper', beats: 'rock' },
  { id: 'scissors', emoji: '✌️', label: 'Scissors', beats: 'paper' },
];

module.exports = {
  name: 'rockpaperscissors',
  category: 'games',
  description: 'Play Rock/Paper/Scissors vs the bot or challenge a member. Accepts @user or raw userID.',
  usage: '[@user|userID]',
  aliases: ['rps'],
  cooldown: 3,
  async execute(message, args, client) {
    const target = args && args[0]
      ? (await resolveUserArg(message, args[0], { silent: true }))
      : null;
    const vsBot = !target || target.id === message.author.id;

    const embed = responseBuilder.buildResult({ title: '✊ ✋ ✌️ Rock / Paper / Scissors', description: vsBot ? `Playing vs the bot. <@${message.author.id}>, pick your move!` : `Challenge: <@${message.author.id}> vs <@${target.id}>.\n<@${message.author.id}>, pick your move.`});

    const row = new ActionRowBuilder().addComponents(
      CHOICES.map((c) => new ButtonBuilder().setCustomId(`rps_${c.id}`).setLabel(c.label).setEmoji(c.emoji).setStyle(ButtonStyle.Primary)),
    );
    const sent = await message.reply({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });

    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    const moves = new Map();
    let p1 = message.author.id;
    let p2 = vsBot ? 'bot' : target.id;

    collector.on('collect', async (i) => {
      try {
        const choice = i.customId.replace('rps_', '');
        if (vsBot) {
          const bot = CHOICES[Math.floor(Math.random() * 3)];
          const result = winner(choice, bot.id);
          await finish(message, sent, p1, 'bot', choice, bot.id, result);
          collector.stop('done');
          return;
        }
        if (i.user.id !== p1 && i.user.id !== p2) {
          return i.reply({ content: 'This game is between two other players.', ephemeral: true });
        }
        if (moves.has(i.user.id)) {
          return i.reply({ content: 'You already picked.', ephemeral: true });
        }
        moves.set(i.user.id, choice);
        await i.reply({ content: `You picked ${choice}.`, ephemeral: true });
        if (moves.size === 2) {
          const c1 = moves.get(p1);
          const c2 = moves.get(p2);
          await finish(message, sent, p1, p2, c1, c2, winner(c1, c2));
          collector.stop('done');
        }
      } catch (e) { console.error('[rps] collector error:', e.message); }
    });
    collector.on('end', async (_c, reason) => {
      if (reason !== 'done') {
        await sent.edit({ embeds: [responseBuilder.buildResult({ title: 'RPS — timed out'})], components: [] }).catch(() => {});
      }
    });
  },

  async handleButton(interaction) {
    // buttons are collected locally above; this is just to satisfy the router.
    if (!interaction.replied) await interaction.deferUpdate().catch(() => {});
  },
};

function winner(a, b) {
  if (a === b) return 'tie';
  const ac = CHOICES.find((c) => c.id === a);
  return ac.beats === b ? 'p1' : 'p2';
}

async function finish(message, sent, p1, p2, c1, c2, result) {
  try {
    const db = getDb();
    let text;
    if (p2 === 'bot') {
      if (result === 'tie') text = `Tie! You both picked ${c1}.`;
      else if (result === 'p1') { text = `You win! ${c1} beats ${c2}.`; await db.rpsStat.inc(p1, message.guild.id, 'wins'); }
      else { text = `Bot wins! ${c2} beats ${c1}.`; await db.rpsStat.inc(p1, message.guild.id, 'losses'); }
    } else {
      if (result === 'tie') { text = `Tie! Both picked ${c1}.`; await db.rpsStat.inc(p1, message.guild.id, 'ties'); }
      else if (result === 'p1') { text = `<@${p1}> wins! ${c1} beats ${c2}.`; await db.rpsStat.inc(p1, message.guild.id, 'wins'); await db.rpsStat.inc(p2, message.guild.id, 'losses'); }
      else { text = `<@${p2}> wins! ${c2} beats ${c1}.`; await db.rpsStat.inc(p2, message.guild.id, 'wins'); await db.rpsStat.inc(p1, message.guild.id, 'losses'); }
    }
    await sent.edit({ embeds: [responseBuilder.buildResult({ title: 'RPS — result', description: text})], components: [], allowedMentions: { parse: [] } });
  } catch (e) { console.error('[rps] finish error:', e.message); }
}
