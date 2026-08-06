// src/utils/subcommands.js
// Centralized registry of every command's subcommands.
// Each entry: command name -> array of { name, description }
// Used by the help command to display sub-usage.

const SUBCOMMANDS = {
  // ── Admin ──────────────────────────────────────────────
  antinuke: [
    { name: 'enable', description: 'Enable anti-nuke protection' },
    { name: 'disable', description: 'Disable anti-nuke protection' },
    { name: 'setup', description: 'Run the setup wizard' },
    { name: 'status', description: 'Show current anti-nuke config' },
    { name: 'logging <#channel>', description: 'Set the logging channel' },
    { name: 'punishment <ban|kick|strip>', description: 'Set punishment type' },
    { name: 'owner add|remove|list|reset [@user]', description: 'Manage extra owners' },
    { name: 'whitelist add|remove|show|reset [@user]', description: 'Manage whitelisted users' },
    { name: 'wlrole add|remove|list|reset [@role]', description: 'Manage whitelisted roles' },
  ],
  automod: [
    { name: 'badwords add <words>', description: 'Add bad words (comma-separated)' },
    { name: 'badwords remove <words>', description: 'Remove bad words' },
    { name: 'badwords list', description: 'List all bad words' },
    { name: 'badwords clear', description: 'Clear all bad words' },
    { name: 'antilink on|off', description: 'Toggle anti-link' },
    { name: 'antispam on|off', description: 'Toggle anti-spam' },
  ],
  autorole: [
    { name: 'config', description: 'View current auto-role config' },
    { name: 'reset <bots|humans>', description: 'Reset auto-roles for bots or humans' },
    { name: 'bots add|remove <@role>', description: 'Manage bot auto-roles' },
    { name: 'humans add|remove <@role>', description: 'Manage human auto-roles' },
    { name: 'set <@role>', description: 'Set a single auto-role for all' },
    { name: 'remove|clear|off', description: 'Remove all auto-roles' },
  ],
  greet: [
    { name: 'setup', description: 'Run the greet embed setup wizard' },
    { name: 'test', description: 'Send a test greet message' },
    { name: 'enable', description: 'Enable greet system' },
    { name: 'disable', description: 'Disable greet system' },
    { name: 'reset', description: 'Reset all greet settings' },
    { name: 'config', description: 'Show current greet config' },
    { name: 'channel add|remove|show <#channel>', description: 'Manage greet channels' },
    { name: 'message <text>', description: 'Set greet message text' },
    { name: 'title <text>', description: 'Set embed title' },
    { name: 'thumbnail <url>', description: 'Set embed thumbnail' },
    { name: 'image <url>', description: 'Set embed image' },
    { name: 'footer <text>', description: 'Set embed footer' },
    { name: 'embed on|off', description: 'Toggle embed mode' },
    { name: 'ping on|off', description: 'Toggle user ping in greet' },
  ],
  ignore: [
    { name: 'bypass <channel|user>', description: 'Toggle bypass for a channel or user' },
    { name: 'show', description: 'Show all ignored channels & users' },
    { name: 'add <channel|user>', description: 'Add to ignore list' },
    { name: 'remove <channel|user>', description: 'Remove from ignore list' },
  ],
  welcome: [
    { name: 'set <#channel>', description: 'Set the welcome channel' },
    { name: 'message|msg <text>', description: 'Set the welcome message' },
    { name: 'preview', description: 'Preview the welcome embed' },
    { name: 'disable|off|remove', description: 'Disable welcome messages' },
  ],
  leave: [
    { name: 'set <#channel>', description: 'Set the leave channel' },
    { name: 'message|msg <text>', description: 'Set the leave message' },
    { name: 'preview', description: 'Preview the leave embed' },
    { name: 'disable|off|remove', description: 'Disable leave messages' },
  ],
  setprefix: [
    { name: '<new-prefix>', description: 'Change the bot prefix' },
  ],
  setlogchannel: [
    { name: '<#channel>', description: 'Set the mod-log channel' },
  ],
  createrole: [
    { name: '<name> [color] [icon]', description: 'Create a new role with optional color & icon' },
  ],
  deleterole: [
    { name: '<role>', description: 'Delete a role by name, ID, or mention' },
  ],
  backup: [
    { name: 'create', description: 'Create a server backup' },
    { name: 'load <id>', description: 'Load a backup by ID' },
    { name: 'list', description: 'List all backups' },
  ],
  whitelist: [
    { name: 'me', description: 'Add yourself to WL (shortcut, no @mention needed)' },
    { name: 'me remove|rm|del', description: 'Remove yourself from WL' },
    { name: 'add <@user>', description: 'Add a user to WL (no prefix needed)' },
    { name: 'remove <@user>', description: 'Remove a user from WL' },
    { name: 'list|show', description: 'Show all whitelisted users' },
    { name: 'clear|reset', description: 'Clear the entire whitelist' },
  ],

  // ── Crypto ──────────────────────────────────────────────
  price: [
    { name: '<coin>', description: 'Get live price (ticker, name, or id)' },
  ],
  convert: [
    { name: '<amount> <base> <target>', description: 'Convert between fiat and/or crypto (alias ?cv)' },
  ],
  bal: [
    { name: '<address>', description: 'Check wallet balance across Polygon, BNB, ETH, LTC, SOL, TRC20' },
  ],
  txid: [
    { name: '<hash>', description: 'Look up a transaction across Polygon, BNB, ETH, LTC, SOL, TRC20 (alias ?tx)' },
  ],

  // ── Moderation ─────────────────────────────────────────
  role: [
    { name: 'all <@role>', description: 'Give a role to ALL members' },
    { name: 'bots <@role>', description: 'Give a role to all bots' },
    { name: 'humans <@role>', description: 'Give a role to all humans' },
    { name: 'create <name> [color]', description: 'Create a new role' },
    { name: 'delete <role>', description: 'Delete a role' },
    { name: 'rename <role> <new-name>', description: 'Rename a role' },
    { name: 'temp <@user> <@role> <time>', description: 'Give a temporary role' },
    { name: 'cancel', description: 'Cancel pending role operation' },
    { name: 'status', description: 'View pending temp role operations' },
  ],
  rrole: [
    { name: 'cancel', description: 'Cancel pending removal' },
    { name: 'all <@role>', description: 'Remove role from ALL members' },
    { name: 'bots <@role>', description: 'Remove role from all bots' },
    { name: 'humans <@role>', description: 'Remove role from all humans' },
  ],
  mod: [
    { name: 'show|list', description: 'Show current mod list' },
    { name: 'role <@role>', description: 'Set the mod role' },
    { name: 'reset', description: 'Reset mod list' },
    { name: 'add <@user>', description: 'Add a user as mod' },
    { name: 'setup <@role>', description: 'Setup mod role + add all with it' },
    { name: 'remove|del <@user>', description: 'Remove a mod' },
  ],
  owner: [
    { name: 'show|list', description: 'Show current owner list' },
    { name: 'reset', description: 'Reset owner list' },
    { name: 'add <@user>', description: 'Add a user as owner' },
    { name: 'remove|del <@user>', description: 'Remove an owner' },
  ],
  admin: [
    { name: 'show|list', description: 'Show current admin list' },
    { name: 'role <@role>', description: 'Set the admin role' },
    { name: 'reset', description: 'Reset admin list' },
    { name: 'add <@user>', description: 'Add a user as admin' },
    { name: 'remove|del <@user>', description: 'Remove an admin' },
  ],
  purge: [
    { name: '<number|all>', description: 'Delete recent messages in this channel' },
    { name: 'human <number|all>', description: 'Delete only human messages' },
    { name: 'bot <number|all>', description: 'Delete only bot messages' },
  ],
  warn: [
    { name: 'add <@user> <reason>', description: 'Warn a user' },
    { name: 'list <@user>', description: 'List warnings for a user' },
    { name: 'remove <@user> <index>', description: 'Remove a specific warning' },
    { name: 'clear <@user>', description: 'Clear all warnings for a user' },
    { name: 'clearall', description: 'Clear ALL warnings for everyone' },
  ],
  voice: [
    { name: 'request <channel-name>', description: 'Request a temporary voice channel' },
    { name: 'kick <@user>', description: 'Kick user from voice channel' },
    { name: 'kickall', description: 'Kick all from current voice channel' },
    { name: 'mute <@user>', description: 'Mute user in voice channel' },
    { name: 'muteall', description: 'Mute all in current voice channel' },
    { name: 'unmute <@user>', description: 'Unmute user in voice channel' },
    { name: 'unmuteall', description: 'Unmute all in current voice channel' },
    { name: 'deafen <@user>', description: 'Deafen user in voice channel' },
    { name: 'deafenall', description: 'Deafen all in current voice channel' },
    { name: 'undeafen <@user>', description: 'Undeafen user in voice channel' },
    { name: 'undeafenall', description: 'Undeafen all in current voice channel' },
    { name: 'moveall <channel>', description: 'Move all to another voice channel' },
    { name: 'pull <@user> [channel]', description: 'Pull a user to your voice channel' },
    { name: 'pullall [channel]', description: 'Pull all to a voice channel' },
    { name: 'invite <@user> <channel>', description: 'Invite user to a voice channel' },
    { name: 'ban <@user>', description: 'Ban user from voice channels' },
  ],
  modlimit: [
    { name: 'show', description: 'Show current mod limits' },
    { name: 'reset', description: 'Reset mod limits to default' },
    { name: 'set <number>', description: 'Set general mod action limit' },
    { name: 'set admin <number>', description: 'Set admin-specific limit' },
    { name: 'set mod <number>', description: 'Set mod-specific limit' },
  ],
  autopurge: [
    { name: 'on <maxAge> [interval]', description: 'Enable auto-purge (seconds)' },
    { name: 'off', description: 'Disable auto-purge' },
  ],

  // ── Utility ────────────────────────────────────────────
  tag: [
    { name: '<name>', description: 'View a saved tag' },
    { name: 'message <name> <content>', description: 'Create a tag with message content' },
    { name: 'revoke <name>', description: 'Delete a tag' },
    { name: 'settings <name> <key> <value>', description: 'Update tag settings' },
    { name: 'reset <name>', description: 'Reset a tag to default' },
  ],
  list: [
    { name: 'reminders', description: 'List your active reminders' },
    { name: 'upi', description: 'List all saved UPI IDs' },
    { name: 'warns <@user>', description: 'List warnings for a user' },
    { name: 'admins', description: 'List all server admins' },
    { name: 'mods', description: 'List all server mods' },
    { name: 'bots', description: 'List all bots in the server' },
    { name: 'bans', description: 'List all banned users' },
    { name: 'boosters', description: 'List all server boosters' },
    { name: 'emojis', description: 'List all server emojis' },
    { name: 'botemojis', description: 'List emojis added by bots' },
    { name: 'roles', description: 'List all server roles' },
    { name: 'inrole <@role>', description: 'List members with a specific role' },
    { name: 'activedeveloper', description: 'List Active Developer badge holders' },
    { name: 'early', description: 'List Early Supporter badge holders' },
    { name: 'joinpos <@user>', description: 'Show join position of a user' },
    { name: 'createpos <@user>', description: 'Show account creation date' },
  ],
  afk: [
    { name: '<reason>', description: 'Go AFK with an optional reason' },
    { name: 'dm on', description: 'Enable DM replies while AFK' },
    { name: 'dm off', description: 'Disable DM replies while AFK' },
    { name: 'clear', description: 'Clear your AFK status manually' },
  ],
  banner: [
    { name: 'server', description: 'Show the server banner' },
    { name: 'user <@user>', description: 'Show a user\'s banner (default: yourself)' },
  ],
  status: [
    { name: 'online|idle|dnd|invisible', description: 'Change the bot\'s status' },
  ],
  rm: [
    { name: 'list', description: 'List your active reminders' },
    { name: 'cancel <id>', description: 'Cancel a specific reminder' },
    { name: '<id>', description: 'Remove a reminder by ID' },
  ],
  sent: [
    { name: '<message> [delay]', description: 'Send a message after optional delay' },
  ],
  poll: [
    { name: '<question> <option1> <option2> ...', description: 'Create a poll with options' },
  ],

  // ── Extra ──────────────────────────────────────────────
  sync: [
    { name: 'guild', description: 'Sync slash commands to current guild (default)' },
    { name: 'global', description: 'Sync slash commands globally' },
    { name: 'clear', description: 'Clear all slash commands' },
  ],
  top: [
    { name: 'reaction', description: 'Show reaction game leaderboard (default)' },
    { name: 'rps', description: 'Show RPS game leaderboard' },
  ],
  reload: [
    { name: '[module]', description: 'Reload a command module or all modules' },
  ],
};

/**
 * Get subcommands for a command.
 * @param {string} cmdName
 * @returns {{ name: string, description: string }[]}
 */
function get(cmdName) {
  return SUBCOMMANDS[cmdName] || [];
}

/**
 * Check if a command has subcommands.
 * @param {string} cmdName
 * @returns {boolean}
 */
function has(cmdName) {
  return Array.isArray(SUBCOMMANDS[cmdName]) && SUBCOMMANDS[cmdName].length > 0;
}

/**
 * Get all commands that have subcommands.
 * @returns {string[]}
 */
function allCommandsWithSubs() {
  return Object.keys(SUBCOMMANDS).filter((k) => SUBCOMMANDS[k].length > 0);
}

module.exports = { SUBCOMMANDS, get, has, allCommandsWithSubs };
