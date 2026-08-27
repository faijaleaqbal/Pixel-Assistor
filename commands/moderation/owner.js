// src/commands/moderation/owner.js
// Configure server trusted owners (User-based).
// SECURITY: Restricted strictly to the Server Owner or Bot Creator.
// Usage: ?owner add <@user|userID> | ?owner remove <@user|userID> | ?owner list | ?owner reset

const responseBuilder = require('../../utils/responseBuilder');
const { getDb } = require('../../utils/db');
const { isBotOwner, isGuildOwner } = require('../../utils/perms');
const { resolveUserArg } = require('../../utils/resolveUser');
const { opts } = require('../../utils/v2Reply');
const { getPrefix } = require('../../utils/prefixCache');

module.exports = {
  name: 'owner',
  category: 'moderation',
  description: 'Manage server trusted owners. Only the Server Owner or Bot Creator can use this command.',
  usage: '<add|remove|list|reset> [@user|userID]',
  cooldown: 3,
  permissions: ['Administrator'],

  async execute(message, args, client) {
    const prefix = await getPrefix(message.guild?.id);
    const isPrimaryGuildOwner = isGuildOwner(message.author.id, message.guild);
    const isBotCreator = isBotOwner(message.author.id);

    // Strict Security Guard: Only the Primary Guild Owner or Bot Creator can modify the owner list
    if (!isPrimaryGuildOwner && !isBotCreator) {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: 'Access Denied',
          description: '❌ Only the **Server Owner** can manage the trusted owner list.',
        }))
      );
    }

    const db = getDb();
    const gCfg = (await db.guildConfig.get(message.guild.id)) || {};
    const sub = (args[0] || '').toLowerCase();
    let extraOwners = Array.isArray(gCfg.extraOwners) ? [...gCfg.extraOwners] : [];

    // ── List / Show / Default ──
    if (!sub || sub === 'list' || sub === 'show') {
      const serverOwnerStr = `<@${message.guild.ownerId}> (\`${message.guild.ownerId}\`)`;
      const extraOwnersStr = extraOwners.length
        ? extraOwners.map((id) => `<@${id}> (\`${id}\`)`).join('\n')
        : '*No extra trusted owners configured.*';

      return message.reply(
        opts(responseBuilder.buildResult({
          title: '👑 Server Owner & Trusted Owners',
          fields: [
            { name: 'Server Owner (Primary)', value: serverOwnerStr, inline: false },
            { name: 'Trusted Owners (Extra)', value: extraOwnersStr, inline: false },
          ],
        }))
      );
    }

    // ── Add User ──
    if (sub === 'add') {
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}owner add <@user|userID>\``,
          }))
        );
      }

      const targetUser = await resolveUserArg(message, args[1], { silent: true });
      if (!targetUser) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Unsuccessful Operations',
            description: `❌ Could not resolve a user from \`${args[1]}\`. Please provide a valid user mention or 17-19 digit user ID.`,
          }))
        );
      }

      if (targetUser.bot) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Unsuccessful Operations',
            description: '❌ You cannot add a bot as a trusted owner.',
          }))
        );
      }

      if (targetUser.id === message.guild.ownerId || isBotOwner(targetUser.id)) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Unsuccessful Operations',
            description: `⚠️ <@${targetUser.id}> is already the Server Owner or Bot Creator.`,
          }))
        );
      }

      if (extraOwners.includes(targetUser.id)) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Unsuccessful Operations',
            description: `⚠️ <@${targetUser.id}> (\`${targetUser.id}\`) is already in the trusted owner list.`,
          }))
        );
      }

      extraOwners.push(targetUser.id);
      await db.guildConfig.set(message.guild.id, { extraOwners });

      return message.reply(
        opts(responseBuilder.buildResult({
          title: '👑 Trusted Owner Addition',
          description: `**Successful Operations:**\n• <@${targetUser.id}> (\`${targetUser.id}\`) has been added to the Trusted Owner list.`,
        }))
      );
    }

    // ── Remove User ──
    if (sub === 'remove' || sub === 'del' || sub === 'delete') {
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}owner remove <@user|userID>\``,
          }))
        );
      }

      const targetUser = await resolveUserArg(message, args[1], { silent: true });
      const targetId = targetUser ? targetUser.id : (args[1].match(/\d{17,19}/) ? args[1].match(/\d{17,19}/)[0] : null);

      if (!targetId) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Unsuccessful Operations',
            description: `❌ Could not resolve a user ID from \`${args[1]}\`.`,
          }))
        );
      }

      if (targetId === message.guild.ownerId) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Unsuccessful Operations',
            description: '❌ Cannot remove the primary Server Owner.',
          }))
        );
      }

      if (!extraOwners.includes(targetId)) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Unsuccessful Operations',
            description: `❌ <@${targetId}> (\`${targetId}\`) is not in the trusted owner list.`,
          }))
        );
      }

      extraOwners = extraOwners.filter((id) => id !== targetId);
      await db.guildConfig.set(message.guild.id, { extraOwners });

      return message.reply(
        opts(responseBuilder.buildResult({
          title: '👑 Trusted Owner Removal',
          description: `**Successful Operations:**\n• <@${targetId}> (\`${targetId}\`) has been removed from the Trusted Owner list.`,
        }))
      );
    }

    // ── Reset / Clear ──
    if (sub === 'reset' || sub === 'clear') {
      await db.guildConfig.set(message.guild.id, { extraOwners: [] });
      return message.reply(
        opts(responseBuilder.buildResult({
          title: '👑 Trusted Owners Reset',
          description: '✅ Successfully cleared all extra trusted owners for this server.',
        }))
      );
    }

    return message.reply(
      opts(responseBuilder.buildResult({
        description: `Usage: \`${prefix}owner <add|remove|list|reset> [@user|userID]\``,
      }))
    );
  },
};
