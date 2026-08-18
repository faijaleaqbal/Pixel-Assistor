// src/handlers/commandHandler.js
// Dynamic file-based command loader. Scans /commands/<category>/*.js, requires each,
// validates structure, and registers commands + aliases safely.
// Fails startup if any command is broken or duplicates are found.

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const meta = require('../utils/commandMeta');

const commands = new Map();
const aliases = new Map();

function load(client) {
  commands.clear();
  aliases.clear();
  meta.clear();

  const root = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(root)) {
    const msg = `commands directory missing at: ${root}`;
    logger.error(msg);
    throw new Error(msg);
  }

  const categories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let totalLoaded = 0;
  const loadErrors = [];

  for (const category of categories) {
    const dir = path.join(root, category);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const fp = path.join(dir, file);
      try {
        delete require.cache[require.resolve(fp)];
        const cmd = require(fp);

        if (!cmd || !cmd.name || typeof cmd.execute !== 'function') {
          const err = `Invalid command file "${fp}": must export "name" and an "execute()" function.`;
          loadErrors.push(err);
          logger.error(err);
          continue;
        }

        const cmdName = String(cmd.name).toLowerCase().trim();
        cmd.name = cmdName;
        cmd.category = (cmd.category || category).toLowerCase().trim();
        cmd.cooldown = cmd.cooldown ?? 3;

        if (commands.has(cmdName)) {
          const err = `Duplicate command name "${cmdName}" found in "${fp}".`;
          loadErrors.push(err);
          logger.error(err);
          continue;
        }

        commands.set(cmdName, cmd);

        // Register metadata for the help command and slash syncing.
        meta.register(cmd.name, {
          category: cmd.category,
          description: cmd.description || 'No description provided.',
          usage: cmd.usage || '',
          aliases: cmd.aliases || [],
          cooldown: cmd.cooldown,
          permissions: cmd.permissions || [],
          ownerOnly: !!cmd.ownerOnly,
          args: cmd.args || false,
          slash: !!cmd.slash,
          slashOptions: cmd.slashOptions || [],
        });

        if (cmd.aliases && Array.isArray(cmd.aliases)) {
          for (const a of cmd.aliases) {
            const aliasLc = String(a).toLowerCase().trim();
            if (!aliasLc) continue;

            if (commands.has(aliasLc)) {
              const err = `Alias "${aliasLc}" in "${fp}" conflicts with existing command name.`;
              loadErrors.push(err);
              logger.error(err);
              continue;
            }

            if (aliases.has(aliasLc) && aliases.get(aliasLc) !== cmdName) {
              const err = `Duplicate alias "${aliasLc}" in "${fp}" already registered to "${aliases.get(aliasLc)}".`;
              loadErrors.push(err);
              logger.error(err);
              continue;
            }

            aliases.set(aliasLc, cmdName);
          }
        }

        totalLoaded++;
      } catch (e) {
        const err = `Failed loading command file "${fp}": ${e.message}`;
        loadErrors.push(err);
        logger.error(err, e.stack);
      }
    }
  }

  if (loadErrors.length > 0) {
    const summary = `Command Loader encountered ${loadErrors.length} fatal error(s):\n• ` + loadErrors.join('\n• ');
    logger.error(summary);
    throw new Error(summary);
  }

  logger.success(`Loaded ${totalLoaded} commands across ${meta.getCategories().length} categories.`);
  if (client) client.commands = commands;
  return commands;
}

function resolve(name) {
  const lc = String(name || '').toLowerCase().trim();
  if (commands.has(lc)) return commands.get(lc);
  if (aliases.has(lc)) return commands.get(aliases.get(lc));
  return null;
}

module.exports = { load, resolve, commands, aliases };
