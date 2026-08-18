// src/handlers/commandHandler.js
// Dynamic file-based command loader. Scans /commands/<category>/*.js, requires each,
// expects `module.exports = { name, category, description, usage, aliases, cooldown,
// permissions, ownerOnly, args, execute(message, args, client) }`.
// Also registers each command's metadata into commandMeta for the help command.

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const meta = require('../utils/commandMeta');

const commands = new Map();
const aliases = new Map();

function load(client) {
  commands.clear();
  aliases.clear();

  const root = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(root)) {
    logger.warn(`commands dir missing: ${root}`);
    return commands;
  }

  const categories = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let totalLoaded = 0;

  for (const category of categories) {
    const dir = path.join(root, category);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const fp = path.join(dir, file);
      try {
        delete require.cache[require.resolve(fp)];
        const cmd = require(fp);
        if (!cmd || !cmd.name || typeof cmd.execute !== 'function') {
          logger.warn(`skipping ${fp}: missing name/execute`);
          continue;
        }
        cmd.category = cmd.category || category;
        cmd.cooldown = cmd.cooldown ?? 3;
        // Store command name lowercased so resolve() (which lowercases the lookup)
        // can find it. Same for aliases.
        const cmdName = String(cmd.name).toLowerCase();
        cmd.name = cmdName;
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

        if (cmd.aliases && cmd.aliases.length) {
          for (const a of cmd.aliases) aliases.set(String(a).toLowerCase(), cmdName);
        }
        totalLoaded++;
      } catch (e) {
        logger.error(`failed loading ${fp}`, e.message);
      }
    }
  }

  logger.success(`Loaded ${totalLoaded} commands across ${categories.length} categories.`);
  if (client) client.commands = commands;
  return commands;
}

function resolve(name) {
  const lc = String(name || '').toLowerCase();
  if (commands.has(lc)) return commands.get(lc);
  if (aliases.has(lc)) return commands.get(aliases.get(lc));
  return null;
}

module.exports = { load, resolve, commands, aliases };
