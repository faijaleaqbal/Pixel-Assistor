// src/commands/moderation/voice.js
// Voice channel management with full subcommands support (including pull, moveall, kickall, mute, deafen, etc.).

const responseBuilder = require('../../utils/responseBuilder');
const { opts, buildContainer } = require('../../utils/v2Reply');
const { resolveMemberArg } = require('../../utils/resolveUser');
const { checkBotPermissions, canManageMember } = require('../../utils/perms');
const { getPrefix } = require('../../utils/prefixCache');

function needVoice(message) {
  if (!message.member?.voice?.channel) {
    message.reply(
      opts(responseBuilder.buildResult({
        title: 'Voice Error',
        description: '❌ You need to be in a voice channel to use this command.',
      }))
    );
    return false;
  }
  return true;
}

function getMyChannel(message) {
  return message.member?.voice?.channel;
}

module.exports = {
  name: 'voice',
  category: 'moderation',
  description: 'Voice channel management (pull, moveall, kick, mute, deafen, invite, ban, etc.).',
  usage: '<pull|moveall|kick|kickall|mute|muteall|unmute|unmuteall|deafen|deafenall|undeafen|undeafenall|invite|ban|unban> [args]',
  cooldown: 3,
  permissions: ['MoveMembers'],

  async execute(message, args, client) {
    const prefix = await getPrefix(message.guild?.id);
    const sub = (args[0] || '').toLowerCase();

    // ── No sub-command or help ──
    if (!sub || sub === 'help') {
      return message.reply(
        opts(responseBuilder.buildResult({
          title: '🔊 Voice Subcommands',
          description: `**Usage:** \`${prefix}voice <subcommand> [args]\`\n\n` +
            `• \`${prefix}voice pull <@user|userID>\` — Move a user to your voice channel\n` +
            `• \`${prefix}voice pullall <@user|userID>\` — Move all users from target's voice channel to yours\n` +
            `• \`${prefix}voice moveall <@user|userID>\` — Move all from target's channel to yours\n` +
            `• \`${prefix}voice kick <@user|userID>\` — Disconnect a user from voice\n` +
            `• \`${prefix}voice kickall\` — Disconnect all users in your voice channel\n` +
            `• \`${prefix}voice mute <@user|userID>\` — Server-mute a user\n` +
            `• \`${prefix}voice muteall\` — Server-mute everyone in your voice channel\n` +
            `• \`${prefix}voice unmute <@user|userID>\` — Server-unmute a user\n` +
            `• \`${prefix}voice unmuteall\` — Server-unmute everyone in your voice channel\n` +
            `• \`${prefix}voice deafen <@user|userID>\` — Server-deafen a user\n` +
            `• \`${prefix}voice deafenall\` — Server-deafen everyone in your voice channel\n` +
            `• \`${prefix}voice undeafen <@user|userID>\` — Server-undeafen a user\n` +
            `• \`${prefix}voice undeafenall\` — Server-undeafen everyone in your voice channel\n` +
            `• \`${prefix}voice invite\` — Create an instant invite to your voice channel\n` +
            `• \`${prefix}voice ban <@user|userID>\` — Disconnect and block a user from your voice channel\n` +
            `• \`${prefix}voice unban <@user|userID>\` — Unblock a user from your voice channel`,
        }))
      );
    }

    // ── pull <@user|userID> ──
    if (sub === 'pull') {
      if (!needVoice(message)) return;

      const botCheck = checkBotPermissions(message, ['MoveMembers']);
      if (!botCheck.ok) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Voice Error',
            description: "❌ I don't have permission to move members.",
          }))
        );
      }

      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice pull <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      if (!target.voice?.channel) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Voice Error',
            description: '❌ That user is not in a voice channel.',
          }))
        );
      }

      const myVc = getMyChannel(message);
      if (target.voice.channelId === myVc.id) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `ℹ️ **${target.user.tag}** is already in **${myVc.name}**.`,
          }))
        );
      }

      try {
        await target.voice.setChannel(myVc, `Voice pull by ${message.author.tag}`);
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '🔊 Voice Pull',
            description: `✅ Moved **${target.user.tag}** to **${myVc.name}**.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Voice Error',
            description: `Failed to move ${target.user.tag}: ${err.message}`,
          }))
        );
      }
    }

    // ── pullall | moveall <@user|userID> ──
    if (sub === 'pullall' || sub === 'moveall') {
      if (!needVoice(message)) return;

      const botCheck = checkBotPermissions(message, ['MoveMembers']);
      if (!botCheck.ok) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Voice Error',
            description: "❌ I don't have permission to move members.",
          }))
        );
      }

      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID in the target channel.\nUsage: \`${prefix}voice ${sub} <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      if (!target.voice?.channel) {
        return message.reply(
          opts(responseBuilder.buildResult({
            title: 'Voice Error',
            description: '❌ That user is not in a voice channel.',
          }))
        );
      }

      const dest = getMyChannel(message);
      if (target.voice.channelId === dest.id) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `ℹ️ That user is already in your voice channel (**${dest.name}**).`,
          }))
        );
      }

      const members = target.voice.channel.members.filter((m) => !m.user.bot);
      if (!members.size) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: 'No human users to move in that channel.',
          }))
        );
      }

      let count = 0;
      for (const [, m] of members) {
        try {
          await m.voice.setChannel(dest, `Voice ${sub} by ${message.author.tag}`);
          count++;
        } catch {}
      }

      return message.reply(
        opts(responseBuilder.buildResult({
          title: '🔊 Voice Move',
          description: `✅ Moved **${count}** user(s) from **${target.voice.channel.name}** to **${dest.name}**.`,
        }))
      );
    }

    // ── kick <@user|userID> ──
    if (sub === 'kick') {
      if (!needVoice(message)) return;
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice kick <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      if (!target.voice?.channel) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: '❌ That user is not in a voice channel.',
          }))
        );
      }

      try {
        await target.voice.disconnect(`Voice kick by ${message.author.tag}`);
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `✅ Disconnected **${target.user.tag}** from voice.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to disconnect that user: ${err.message}`,
          }))
        );
      }
    }

    // ── kickall ──
    if (sub === 'kickall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter((m) => !m.user.bot && m.id !== message.author.id);
      if (!members.size) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: 'No users to kick in this voice channel.',
          }))
        );
      }

      let count = 0;
      for (const [, m] of members) {
        try {
          await m.voice.disconnect(`Voice kickall by ${message.author.tag}`);
          count++;
        } catch {}
      }

      return message.reply(
        opts(responseBuilder.buildResult({
          description: `✅ Disconnected **${count}** user(s) from **${vc.name}**.`,
        }))
      );
    }

    // ── mute <@user|userID> ──
    if (sub === 'mute') {
      if (!needVoice(message)) return;
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice mute <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      if (!target.voice?.channel) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: '❌ That user is not in a voice channel.',
          }))
        );
      }

      try {
        await target.voice.setMute(true, `Voice mute by ${message.author.tag}`);
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `✅ Server-muted **${target.user.tag}**.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to mute that user: ${err.message}`,
          }))
        );
      }
    }

    // ── muteall ──
    if (sub === 'muteall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter((m) => !m.user.bot && m.id !== message.author.id && !m.voice.serverMute);
      if (!members.size) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: 'No unmuted users to mute in this channel.',
          }))
        );
      }

      let count = 0;
      for (const [, m] of members) {
        try {
          await m.voice.setMute(true, `Voice muteall by ${message.author.tag}`);
          count++;
        } catch {}
      }

      return message.reply(
        opts(responseBuilder.buildResult({
          description: `✅ Server-muted **${count}** user(s) in **${vc.name}**.`,
        }))
      );
    }

    // ── unmute <@user|userID> ──
    if (sub === 'unmute') {
      if (!needVoice(message)) return;
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice unmute <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      if (!target.voice?.channel) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: '❌ That user is not in a voice channel.',
          }))
        );
      }

      try {
        await target.voice.setMute(false, `Voice unmute by ${message.author.tag}`);
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `✅ Server-unmuted **${target.user.tag}**.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to unmute that user: ${err.message}`,
          }))
        );
      }
    }

    // ── unmuteall ──
    if (sub === 'unmuteall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter((m) => !m.user.bot && m.voice.serverMute);
      if (!members.size) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: 'No muted users to unmute in this channel.',
          }))
        );
      }

      let count = 0;
      for (const [, m] of members) {
        try {
          await m.voice.setMute(false, `Voice unmuteall by ${message.author.tag}`);
          count++;
        } catch {}
      }

      return message.reply(
        opts(responseBuilder.buildResult({
          description: `✅ Server-unmuted **${count}** user(s) in **${vc.name}**.`,
        }))
      );
    }

    // ── deafen <@user|userID> ──
    if (sub === 'deafen') {
      if (!needVoice(message)) return;
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice deafen <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      if (!target.voice?.channel) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: '❌ That user is not in a voice channel.',
          }))
        );
      }

      try {
        await target.voice.setDeaf(true, `Voice deafen by ${message.author.tag}`);
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `✅ Server-deafened **${target.user.tag}**.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to deafen that user: ${err.message}`,
          }))
        );
      }
    }

    // ── deafenall ──
    if (sub === 'deafenall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter((m) => !m.user.bot && m.id !== message.author.id && !m.voice.serverDeaf);
      if (!members.size) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: 'No undeafened users to deafen in this channel.',
          }))
        );
      }

      let count = 0;
      for (const [, m] of members) {
        try {
          await m.voice.setDeaf(true, `Voice deafenall by ${message.author.tag}`);
          count++;
        } catch {}
      }

      return message.reply(
        opts(responseBuilder.buildResult({
          description: `✅ Server-deafened **${count}** user(s) in **${vc.name}**.`,
        }))
      );
    }

    // ── undeafen <@user|userID> ──
    if (sub === 'undeafen') {
      if (!needVoice(message)) return;
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice undeafen <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      if (!target.voice?.channel) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: '❌ That user is not in a voice channel.',
          }))
        );
      }

      try {
        await target.voice.setDeaf(false, `Voice undeafen by ${message.author.tag}`);
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `✅ Server-undeafened **${target.user.tag}**.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to undeafen that user: ${err.message}`,
          }))
        );
      }
    }

    // ── undeafenall ──
    if (sub === 'undeafenall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter((m) => !m.user.bot && m.voice.serverDeaf);
      if (!members.size) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: 'No deafened users to undeafen in this channel.',
          }))
        );
      }

      let count = 0;
      for (const [, m] of members) {
        try {
          await m.voice.setDeaf(false, `Voice undeafenall by ${message.author.tag}`);
          count++;
        } catch {}
      }

      return message.reply(
        opts(responseBuilder.buildResult({
          description: `✅ Server-undeafened **${count}** user(s) in **${vc.name}**.`,
        }))
      );
    }

    // ── invite ──
    if (sub === 'invite') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      try {
        const invite = await vc.createInvite({
          maxAge: 86400,
          maxUses: 5,
          reason: `Voice invite by ${message.author.tag}`,
        });
        return message.reply(
          opts(responseBuilder.buildResult({
            title: '🔊 Voice Channel Invite',
            description: `✅ Invite created for **${vc.name}**:\n${invite.url}`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to create invite: ${err.message}`,
          }))
        );
      }
    }

    // ── ban <@user|userID> ──
    if (sub === 'ban') {
      if (!needVoice(message)) return;
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice ban <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      const vc = getMyChannel(message);
      try {
        if (target.voice?.channelId === vc.id) {
          await target.voice.disconnect(`Voice ban by ${message.author.tag}`).catch(() => {});
        }
        await vc.permissionOverwrites.edit(target.id, { Connect: false });
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `✅ Voice-banned **${target.user.tag}** from **${vc.name}**.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to voice-ban that user: ${err.message}`,
          }))
        );
      }
    }

    // ── unban <@user|userID> ──
    if (sub === 'unban') {
      if (!needVoice(message)) return;
      if (!args[1]) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Mention a user or provide a user ID.\nUsage: \`${prefix}voice unban <@user|userID>\``,
          }))
        );
      }

      const target = await resolveMemberArg(message, args[1]);
      if (!target) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `❌ Could not find a member with ID \`${args[1]}\`.`,
          }))
        );
      }

      const vc = getMyChannel(message);
      try {
        await vc.permissionOverwrites.delete(target.id);
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `✅ Voice-unbanned **${target.user.tag}** from **${vc.name}**.`,
          }))
        );
      } catch (err) {
        return message.reply(
          opts(responseBuilder.buildResult({
            description: `Failed to voice-unban that user: ${err.message}`,
          }))
        );
      }
    }

    // ── Fallback ──
    return message.reply(
      opts(responseBuilder.buildResult({
        description: `❌ Unknown subcommand: \`${sub}\`.\nUse \`${prefix}voice help\` to view all available voice commands.`,
      }))
    );
  },
};
