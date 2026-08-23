// src/utils/v2Reply.js
// Components V2 reply factory — the single source of truth for the bot's visual language.
// Every command/event reply must flow through here (directly, or via responseBuilder).
//
// Usage in commands:
//   const { opts, buildContainer } = require('../../utils/v2Reply');
//   await interaction.reply(opts(buildContainer({ title: 'Done', description: 'OK', color: '#57F287' })));
//   await interaction.reply(opts(container, { ephemeral: true }));

const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const config = require('./config');

const DEFAULT_ACCENT_HEX = config.embedColor
  ? `#${config.embedColor.toString(16).padStart(6, '0')}`
  : '#5865F2';

function hexToInt(hex) {
  if (typeof hex === 'number') return hex;
  const n = parseInt(String(hex).replace('#', ''), 16);
  return Number.isNaN(n) ? hexToInt(DEFAULT_ACCENT_HEX) : n;
}

function safeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function text(content) {
  return new TextDisplayBuilder().setContent(String(content ?? ''));
}

// Builds a V2 container from simple building blocks.
// - title/emoji      -> "## emoji | **Title**" heading line
// - description      -> free-form markdown paragraph(s)
// - fields           -> array of strings OR { name, value } pairs rendered as "› **name:** value"
// - color            -> accepted for backward compatibility; ignored (no accent bar)
// - thumbnail/image  -> optional https URLs rendered as accessory/gallery
function buildContainer({
  title,
  emoji,
  description,
  fields = [],
  thumbnail,
  image,
  customFooter,
} = {}) {
  const lines = [];

  if (title) {
    const icon = emoji ? `${emoji} | ` : '';
    lines.push(`## ${icon}**${title}**`);
  }
  if (description) lines.push(String(description));

  for (const f of fields) {
    if (!f) continue;
    if (typeof f === 'string') {
      lines.push(f);
    } else if (f.name && f.value !== undefined && f.value !== null) {
      lines.push(`› **${f.name}:** ${f.value}`);
    }
  }

  if (customFooter) lines.push('', customFooter);

  const body = lines.join('\n');
  const container = new ContainerBuilder();

  const thumb = safeHttpUrl(thumbnail);
  if (body && thumb) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(body))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb)),
    );
  } else if (body) {
    container.addTextDisplayComponents(text(body));
  }

  const img = safeHttpUrl(image);
  if (img) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems((item) => item.setURL(img)),
    );
  }

  return container;
}

// Wraps one-or-more containers into message payload options.
// Never mix with `content:` or `embeds:` — components only.
function opts(containers, extra = {}) {
  const list = Array.isArray(containers) ? containers.filter(Boolean) : [containers];
  if (!list.length) throw new Error('v2Reply.opts: at least one container is required.');
  const { ephemeral, flags: extraFlags, ...rest } = extra;
  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;
  if (extraFlags) flags |= Number(extraFlags);
  return { ...rest, components: list, flags };
}

module.exports = {
  DEFAULT_ACCENT_HEX,
  hexToInt,
  text,
  buildContainer,
  opts,
};
