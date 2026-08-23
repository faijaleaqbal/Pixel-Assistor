// src/commands/extra/reload.js
// Owner-only. Restarts the bot process. Uses graceful fallback:
//   - If DEPLOY_MANAGER=pm2 and pm2 is reachable, log a hint and exit(0) — pm2 auto-restarts.
//   - If DEPLOY_MANAGER=systemd, send SIGTERM — systemd Restart=on-failure brings it back.
//   - If DEPLOY_MANAGER=termux, exit(0) — assumes an external `while true; do node ...; done` loop.
// All three rely on an external supervisor — the bot itself never re-spawns.

const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const config = require('../../utils/config');
const { isOwner } = require('../../utils/perms');
const logger = require('../../utils/logger');

module.exports = {
  name: 'reload',
  category: 'extra',
  aliases: ['rld'],
  description: 'Restart the bot process (owner-only).',
  usage: '',
  cooldown: 10,
  ownerOnly: true,
  async execute(message) {
    if (!isOwner(message.author.id)) return;
    const mgr = config.deployManager;
    await message.reply(opts(responseBuilder.buildResult({ description: `🔄 Restarting now (deploy manager: \`${mgr}\`). Back in a few seconds.`})));

    logger.warn(`reload triggered by owner — manager=${mgr}`);
    // Give the reply a moment to flush.
    setTimeout(() => {
      // Send SIGTERM for systemd; clean exit(0) for pm2/termux (both rely on external restart loop).
      if (mgr === 'systemd') process.kill(process.pid, 'SIGTERM');
      else process.exit(0);
    }, 600);
  },
};
