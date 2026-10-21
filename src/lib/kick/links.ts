import { normalizeLogin } from '../channels/parseChannels';
import type { KickLinks } from './types';

/** Kick channel slugs: letters, digits, underscores and dashes (stored lowercase). */
const SLUG_RE = /^[a-z0-9_-]{1,25}$/;

/**
 * A Kick slug from a name, "@name" or kick.com / player.kick.com link.
 * Returns null when it isn't one.
 */
export function parseKickSlug(input: string): string | null {
  let value = input.trim();
  if (/[./]/.test(value)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!/^(?:www\.|player\.)?kick\.com$/i.test(url.hostname)) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      value = (segments[0] === 'popout' ? segments[1] : segments[0]) ?? '';
    } catch {
      return null;
    }
  }
  const slug = value.replace(/^@/, '').toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

/** Validates persisted links: valid Twitch logins to valid Kick slugs. */
export function sanitizeKickLinks(input: unknown): KickLinks {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: KickLinks = {};
  for (const [login, slug] of Object.entries(input)) {
    const twitch = normalizeLogin(login);
    const kick = typeof slug === 'string' ? parseKickSlug(slug) : null;
    if (twitch && kick) out[twitch] = kick;
  }
  return out;
}

/** The embedded Kick player for a channel. `id` lets the desktop app find its frame. */
export function kickPlayerUrl(slug: string, { muted, id }: { muted: boolean; id?: string }) {
  const params = new URLSearchParams({ autoplay: 'true', muted: String(muted) });
  if (id) params.set('mtv', id);
  return `https://player.kick.com/${encodeURIComponent(slug)}?${params.toString()}`;
}

/** Kick's popout chat for a channel (embeddable). */
export const kickChatUrl = (slug: string): string =>
  `https://kick.com/popout/${encodeURIComponent(slug)}/chat`;

export const kickChannelUrl = (slug: string): string =>
  `https://kick.com/${encodeURIComponent(slug)}`;
