const responseBuilder = require('../../utils/responseBuilder');
// src/commands/games/tictactoe.js
// Play tic-tac-toe against another member using a button-based 3x3 board.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const config = require('../../utils/config');
const { resolveUserArg } = require('../../utils/resolveUser');
const { opts, buildContainer } = require('../../utils/v2Reply');

const SYMBOLS = { X: '❌', O: '⭕', EMPTY: '⬜' };
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

module.exports = {
  name: 'tictactoe',
  category: 'games',
  description: 'Play tic-tac-toe against another member. Accepts @user or raw userID.',
  usage: '<@user|userID>',
  aliases: ['ttt'],
  cooldown: 5,
  args: true,
  async execute(message, args, client) {
    const opponent = await resolveUserArg(message, args[0]);
    if (!opponent) return;
    if (opponent.bot || opponent.id === message.author.id) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Mention a valid opponent.\nUsage: \`${config.prefix}tictactoe <@user|userID>\``})));
    }

    const board = Array(9).fill(null);
    let turn = message.author.id; // X starts
    const players = { X: message.author.id, O: opponent.id };

    const mkRows = () => {
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
          const i = r * 3 + c;
          const v = board[i];
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`ttt_${i}`)
              .setLabel(' ')
              .setEmoji(v === 'X' ? SYMBOLS.X : v === 'O' ? SYMBOLS.O : SYMBOLS.EMPTY)
              .setStyle(v === 'X' ? ButtonStyle.Danger : v === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(!!v)
          );
        }
        rows.push(row);
      }
      return rows;
    };

    const embed = () => responseBuilder.buildResult({ title: '❌⭕ Tic-Tac-Toe', description: `<@${players.X}> (❌) vs <@${players.O}> (⭕)\nTurn: <@${turn}>`});

    // Fresh container + rows on every render so no stored instance is mutated across turns.
    const renderBoard = () => embed().addActionRowComponents(...mkRows());

    const sent = await message.reply(opts(renderBoard(), { allowedMentions: { parse: [] } }));

    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async (i) => {
      try {
        if (i.user.id !== turn) {
          return i.reply(opts(buildContainer({ description: 'Not your turn.', color: '#ED4245' }), { ephemeral: true }));
        }
        const idx = parseInt(i.customId.replace('ttt_', ''), 10);
        const symbol = turn === players.X ? 'X' : 'O';
        board[idx] = symbol;

        const w = checkWin(board);
        if (w) {
          collector.stop('win');
          await i.update(opts(winEmbed(message.author, opponent, w === 'X' ? message.author.id : opponent.id).addActionRowComponents(...mkRowsFinal(board, w))));
          return;
        }
        if (board.every(Boolean)) {
          collector.stop('draw');
          await i.update(opts(responseBuilder.buildResult({ title: 'Tic-Tac-Toe — Draw!', description: 'No winner.'}).addActionRowComponents(...mkRowsFinal(board))));
          return;
        }
        turn = turn === players.X ? players.O : players.X;
        await i.update(opts(renderBoard()));
      } catch (e) { console.error('[ttt] collector error:', e.message); }
    });
    collector.on('end', async (_c, reason) => {
      if (reason !== 'win' && reason !== 'draw') {
        await sent.edit(opts(responseBuilder.buildResult({ title: 'Tic-Tac-Toe — timed out'}))).catch(() => {});
      }
    });
  },

  async handleButton(interaction) {
    if (!interaction.replied) await interaction.deferUpdate().catch(() => {});
  },
};

function checkWin(b) {
  for (const [a, b1, c] of WIN_LINES) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
  }
  return null;
}

function winEmbed(p1, p2, winnerId) {
  return responseBuilder.buildResult({ title: 'Tic-Tac-Toe — Win!', description: `🎉 <@${winnerId}> wins!\n<@${p1.id}> (❌) vs <@${p2.id}> (⭕)`});
}

function mkRowsFinal(board, winningSymbol) {
  // Disable all; highlight winning line by setting Success style.
  const winningLine = WIN_LINES.find((line) => line.every((i) => board[i] === winningSymbol)) || [];
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const v = board[i];
      const isWin = winningLine.includes(i);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ttt_${i}`)
          .setLabel(' ')
          .setEmoji(v === 'X' ? SYMBOLS.X : v === 'O' ? SYMBOLS.O : SYMBOLS.EMPTY)
          .setStyle(isWin ? ButtonStyle.Success : v === 'X' ? ButtonStyle.Danger : v === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(true)
      );
    }
    rows.push(row);
  }
  return rows;
}
