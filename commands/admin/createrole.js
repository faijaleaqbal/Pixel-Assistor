// src/commands/admin/createrole.js
const responseBuilder = require('../../utils/responseBuilder');
module.exports = {
  name: 'createrole', aliases: ['cr'], category: 'admin', description: 'Create a new role. Usage: createrole <name> [color] [hoist]', usage: '<name> [#color] [hoist]', cooldown: 5, permissions: ['ManageRoles'], args: true,
  async execute(message, args, client) {
    const name = args[0];
    if (!name || name.length > 100) return message.reply({ embeds: [responseBuilder.buildResult({ description: 'Provide a role name (max 100 chars).'})] });
    const colorStr = args[1];
    let color = 0;
    if (colorStr && /^#[0-9a-f]{6}$/i.test(colorStr)) color = parseInt(colorStr.replace('#', ''), 16);
    const hoist = args.map(a => a.toLowerCase()).includes('hoist');
    try {
      const role = await message.guild.roles.create({ name, color, hoist, reason: `Created by ${message.author.tag}` });
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `✅ Role **${role.name}** (\`${role.id}\`) created.`})] });
    } catch (e) {
      return message.reply({ embeds: [responseBuilder.buildResult({ description: `Failed: ${e.message}`})] });
    }
  },
};
