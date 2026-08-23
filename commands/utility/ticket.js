const responseBuilder = require('../../utils/responseBuilder');
// src/commands/utility/ticket.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ComponentType } = require('discord.js');
const { opts, buildContainer } = require('../../utils/v2Reply');

module.exports = {
  name: 'ticket',
  category: 'utility',
  description: 'Create a support ticket panel with a button.',
  usage: '[topic]',
  cooldown: 10,
  permissions: ['ManageChannels'],
  async execute(message, args, client) {
    const topic = args.join(' ') || 'Support';
    const embed = responseBuilder.buildResult({ title: `\uD83C\uDFAB ${topic}`, description: 'Click the button below to open a ticket.'});

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_create').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('\uD83C\uDFAB')
    );

    const sent = await message.reply(opts(embed.addActionRowComponents(row)));

    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 86400000 }); // 24h timeout to prevent memory leak

    collector.on('collect', async (i) => {
      if (i.user.bot) return;
      await i.deferReply({ ephemeral: true });

      // Consistent slug: lowercase + remove spaces (matches what Discord actually creates)
      const slug = i.user.username.toLowerCase().replace(/\s+/g, '');

      // Check for existing ticket
      const existing = message.guild.channels.cache.find(c =>
        c.name.includes(`ticket-${slug}`)
      );
      if (existing) return i.editReply(opts(buildContainer({ description: 'You already have an open ticket.' })));

      // Check channel limit (Discord allows 500 channels per guild)
      if (message.guild.channels.cache.size >= 500) return i.editReply(opts(buildContainer({ description: 'Max channel limit reached.' })));

      let ch;
      try {
        ch = await message.guild.channels.create({
          name: `ticket-${slug}`,
          type: ChannelType.GuildText,
          parent: message.channel.parentId || null,
          permissionOverwrites: [
            { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: message.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
          ],
        });
      } catch (createErr) {
        return i.editReply(opts(buildContainer({ description: `Failed to create ticket channel: ${createErr.message}` })));
      }

      const ticketEmbed = responseBuilder.buildResult({ title: `\uD83C\uDFAB Ticket — ${topic}`, description: `<@${i.user.id}>'s ticket.\nStaff will assist shortly.`});

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger)
      );

      const msg = await ch.send(opts(ticketEmbed.addActionRowComponents(closeRow)));

      // Close collector
      msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 86400000 }) // 24h
        .on('collect', async (ci) => {
          if (!ci.member.permissions.has(PermissionFlagsBits.ManageChannels) && ci.user.id !== i.user.id) {
            return ci.reply(opts(buildContainer({ description: 'You do not have permission to close this ticket.' }), { ephemeral: true }));
          }
          await ci.deferUpdate();
          try { await ch.delete('Ticket closed.'); } catch {}
        });

      try { await i.editReply(opts(buildContainer({ description: `Ticket created: ${ch}` }))); } catch {}
    });
  },
};
