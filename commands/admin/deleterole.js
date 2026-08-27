const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { canManageRole, isTrustedOwner } = require('../../utils/perms');

module.exports = {
  name: 'deleterole',
  aliases: ['dr'],
  category: 'admin',
  description: 'Delete a role by name, mention, or ID.',
  usage: '<role>',
  cooldown: 5,
  ownerOnly: true,
  permissions: ['ManageRoles'],
  args: true,
  async execute(message, args, client) {
    const isAuthorized = await isTrustedOwner(message.author.id, message.guild);
    if (!isAuthorized) {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: 'Access Denied',
          description: "❌ You don't have permission to use this command. This command is restricted to Server Owners & Trusted Owners.",
        }))
      );
    }
    const input = args.join(' ');
    if (!input) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a role name, mention, or ID.'})));

    const role = message.guild.roles.cache.find(r => r.id === input || r.name.toLowerCase() === input.toLowerCase() || `<@&${r.id}>` === input);
    if (!role) return message.reply(opts(responseBuilder.buildResult({ description: 'Role not found.'})));

    const check = canManageRole(message.member, role, message.guild, { actionName: 'delete' });
    if (!check.ok) {
      return message.reply(opts(responseBuilder.buildResult({ description: `❌ ${check.error}`})));
    }

    try {
      await role.delete(`Deleted by ${message.author.tag}`);
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Role **${role.name}** deleted.`})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed: ${e.message}`})));
    }
  },
};
