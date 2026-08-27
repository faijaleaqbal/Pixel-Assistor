const responseBuilder = require('../../utils/responseBuilder');
const { opts } = require('../../utils/v2Reply');
const { isTrustedOwner } = require('../../utils/perms');

module.exports = {
  name: 'createrole',
  aliases: ['cr'],
  category: 'admin',
  description: 'Create a new role. Usage: createrole <name> [color] [hoist]',
  usage: '<name> [#color] [hoist]',
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
    const name = args[0];
    if (!name || name.length > 100) return message.reply(opts(responseBuilder.buildResult({ description: 'Provide a role name (max 100 chars).'})));
    const colorStr = args[1];
    let color = 0;
    if (colorStr && /^#[0-9a-f]{6}$/i.test(colorStr)) color = parseInt(colorStr.replace('#', ''), 16);
    const hoist = args.map(a => a.toLowerCase()).includes('hoist');
    try {
      const role = await message.guild.roles.create({ name, color, hoist, reason: `Created by ${message.author.tag}` });
      return message.reply(opts(responseBuilder.buildResult({ description: `✅ Role **${role.name}** (\`${role.id}\`) created.`})));
    } catch (e) {
      return message.reply(opts(responseBuilder.buildResult({ description: `Failed: ${e.message}`})));
    }
  },
};
