// src/commands/moderation/voice.js
// Voice channel management. 17 subcommands.
// All require MoveMembers except `voice request`. Accepts @user or raw userID everywhere.

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { hasPermission } = require('../../utils/perms');
const { resolveMemberArg } = require('../../utils/resolveUser');

function needVoice(message) {
  if (!message.member.voice.channel) {
    message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('You must be in a voice channel.')] });
    return false;
  }
  return true;
}

async function needTarget(message, args) {
  // arg[1] is the user-arg position after the subcommand
  const target = await resolveMemberArg(message, args[1]);
  return target; // null already replied by resolver
}

function getMyChannel(message) {
  return message.member.voice.channel;
}

module.exports = {
  name: 'voice',
  category: 'moderation',
  description: 'Voice channel management with 17 subcommands.',
  usage: 'kick|kickall|mute|muteall|unmute|unmuteall|deafen|deafenall|undeafen|undeafenall|moveall|pull|pullall|invite|ban|request',
  cooldown: 3,
  permissions: ['MoveMembers'],
  async execute(message, args) {
    const sub = (args[0] || '').toLowerCase();

    // ?voice request — no special perms needed
    if (sub === 'request') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('Coming soon.')] });
    }

    // ── kick ──
    if (sub === 'kick') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      try {
        await target.voice.disconnect('Voice kick by ' + message.author.tag);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Disconnected ${target.user.tag}.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to disconnect that user.')] });
      }
    }

    // ── kickall ──
    if (sub === 'kickall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter(m => !m.user.bot);
      if (!members.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No users to kick.')] });
      let count = 0;
      for (const [, m] of members) {
        try { await m.voice.disconnect('Voice kickall by ' + message.author.tag); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Disconnected ${count} user(s).`)] });
    }

    // ── mute ──
    if (sub === 'mute') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      try {
        await target.voice.setMute(true);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-muted ${target.user.tag}.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to mute that user.')] });
      }
    }

    // ── muteall ──
    if (sub === 'muteall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter(m => !m.user.bot);
      if (!members.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No users to mute.')] });
      let count = 0;
      for (const [, m] of members) {
        try { await m.voice.setMute(true); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-muted ${count} user(s).`)] });
    }

    // ── unmute ──
    if (sub === 'unmute') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      try {
        await target.voice.setMute(false);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-unmuted ${target.user.tag}.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to unmute that user.')] });
      }
    }

    // ── unmuteall ──
    if (sub === 'unmuteall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter(m => !m.user.bot);
      if (!members.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No users to unmute.')] });
      let count = 0;
      for (const [, m] of members) {
        try { await m.voice.setMute(false); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-unmuted ${count} user(s).`)] });
    }

    // ── deafen ──
    if (sub === 'deafen') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      try {
        await target.voice.setDeaf(true);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-deafened ${target.user.tag}.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to deafen that user.')] });
      }
    }

    // ── deafenall ──
    if (sub === 'deafenall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter(m => !m.user.bot);
      if (!members.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No users to deafen.')] });
      let count = 0;
      for (const [, m] of members) {
        try { await m.voice.setDeaf(true); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-deafened ${count} user(s).`)] });
    }

    // ── undeafen ──
    if (sub === 'undeafen') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      try {
        await target.voice.setDeaf(false);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-undeafened ${target.user.tag}.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to undeafen that user.')] });
      }
    }

    // ── undeafenall ──
    if (sub === 'undeafenall') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      const members = vc.members.filter(m => !m.user.bot);
      if (!members.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No users to undeafen.')] });
      let count = 0;
      for (const [, m] of members) {
        try { await m.voice.setDeaf(false); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Server-undeafened ${count} user(s).`)] });
    }

    // ── moveall <@user|userID> ── move all from user's voice channel to YOUR voice channel
    if (sub === 'moveall') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      if (!target.voice.channel) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That user is not in a voice channel.')] });
      const dest = getMyChannel(message);
      const members = target.voice.channel.members.filter(m => !m.user.bot);
      if (!members.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No users to move.')] });
      let count = 0;
      for (const [, m] of members) {
        try { await m.voice.setChannel(dest); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Moved ${count} user(s) to ${dest.name}.`)] });
    }

    // ── pull <@user|userID> ── move user to YOUR voice channel
    if (sub === 'pull') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      if (!target.voice.channel) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That user is not in a voice channel.')] });
      try {
        await target.voice.setChannel(getMyChannel(message));
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Pulled ${target.user.tag} to your channel.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to move that user.')] });
      }
    }

    // ── pullall <@user|userID> ── move all from user's channel to yours
    if (sub === 'pullall') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      if (!target.voice.channel) return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('That user is not in a voice channel.')] });
      const dest = getMyChannel(message);
      const members = target.voice.channel.members.filter(m => !m.user.bot);
      if (!members.size) return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('No users to pull.')] });
      let count = 0;
      for (const [, m] of members) {
        try { await m.voice.setChannel(dest); count++; } catch { /* skip */ }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Pulled ${count} user(s) to ${dest.name}.`)] });
    }

    // ── invite <@user|userID> ── create invite to your voice channel
    if (sub === 'invite') {
      if (!needVoice(message)) return;
      const vc = getMyChannel(message);
      try {
        // CategoryChannel doesn't have createInvite in v14 — always use the voice channel itself.
        const inviteChannel = vc;
        const invite = await inviteChannel.createInvite({ maxAge: 86400, maxUses: 1, reason: 'Voice invite by ' + message.author.tag });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Invite created: ${invite.url}`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to create invite.')] });
      }
    }

    // ── ban <@user|userID> ── disconnect + deny Connect
    if (sub === 'ban') {
      if (!needVoice(message)) return;
      const target = await needTarget(message, args);
      if (!target) return;
      const vc = getMyChannel(message);
      try {
        await target.voice.disconnect('Voice ban by ' + message.author.tag);
        await vc.permissionOverwrites.edit(target.id, { Connect: false });
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Voice-banned ${target.user.tag} from ${vc.name}.`)] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Failed to voice-ban that user.')] });
      }
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('Unknown subcommand.')] });
  },
};
