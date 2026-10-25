/** Twitch logins are 1–25 letters, digits or underscores (stored lowercase). */
const LOGIN_RE = /^[a-z0-9_]{1,25}$/;

export const isValidLogin = (value: string): boolean => LOGIN_RE.test(value);

/** Lowercases and strips a leading "@". Returns null when it is not a valid login. */
export function normalizeLogin(raw: string): string | null {
  const login = raw.trim().replace(/^@/, '').toLowerCase();
  return isValidLogin(login) ? login : null;
}

export type ChannelPlatform = 'twitch' | 'kick';
const KICK_SLUG_RE = /^[a-z0-9_-]{1,25}$/;

/** A direct Kick channel has its own identity, separate from the same Twitch name. */
export const kickSlugFromId = (id: string): string | null =>
  id.startsWith('kick:') && KICK_SLUG_RE.test(id.slice(5)) ? id.slice(5) : null;
export const kickChannelId = (slug: string): string => `kick:${slug}`;
export const channelName = (id: string): string => kickSlugFromId(id) ?? id;
export function normalizeChannel(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  return kickSlugFromId(id) ? id : normalizeLogin(id);
}

/** Accepts a Kick username, @name, direct id, or official channel/player/chat URL. */
export function parseKickSlug(input: string): string | null {
  let value = input.trim();
  if (/^kick:/i.test(value)) value = value.slice(5);
  else if (/[./]/.test(value)) {
    const url = toUrl(value);
    if (!url || !/^(?:www\.|player\.)?kick\.com$/i.test(url.hostname)) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (
      ['categories', 'browse', 'search', 'settings', 'login', 'clips', 'videos'].includes(
        segments[0] ?? '',
      )
    )
      return null;
    value = (segments[0] === 'popout' ? segments[1] : segments[0]) ?? '';
  }
  const slug = value.replace(/^@/, '').toLowerCase();
  return KICK_SLUG_RE.test(slug) ? slug : null;
}

const TWITCH_HOSTS = /^(?:www\.|m\.|go\.)?twitch\.tv$/;
const MULTI_HOSTS = /^(?:www\.)?(?:multitwitch\.tv|multistre\.am|twitchtheater\.tv)$/;
const RESERVED_PATHS = new Set([
  'directory',
  'videos',
  'settings',
  'search',
  'downloads',
  'p',
  'jobs',
]);

/**
 * Extracts channel logins from free text: plain names, "@name", twitch.tv
 * links, and multi-stream links such as multitwitch.tv/a/b/c. Separators can
 * be spaces, commas, semicolons or new lines. Duplicates are removed and the
 * input order is kept.
 */
export function parseChannelInput(input: string, platform: ChannelPlatform = 'twitch'): string[] {
  const out: string[] = [];
  const add = (value: string | undefined) => {
    const login = value ? normalizeLogin(value) : null;
    if (login && !out.includes(login)) out.push(login);
  };
  const addKick = (value: string) => {
    const slug = parseKickSlug(value);
    const id = slug && kickChannelId(slug);
    if (id && !out.includes(id)) out.push(id);
  };

  for (const token of input.split(/[\s,;]+/).filter(Boolean)) {
    if (/^kick:/i.test(token)) {
      addKick(token);
      continue;
    }
    if (/^twitch:/i.test(token)) {
      add(token.slice(7));
      continue;
    }
    const url = toUrl(token);
    if (!url) {
      if (platform === 'kick') addKick(token);
      else add(token);
      continue;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (TWITCH_HOSTS.test(url.hostname)) {
      if (segments[0] === 'popout' || segments[0] === 'embed') add(segments[1]);
      else if (segments[0] && !RESERVED_PATHS.has(segments[0])) add(segments[0]);
      else add(url.searchParams.get('channel') ?? undefined);
    } else if (url.hostname === 'player.twitch.tv') {
      add(url.searchParams.get('channel') ?? undefined);
    } else if (MULTI_HOSTS.test(url.hostname)) {
      segments.forEach(add);
    } else if (/^(?:www\.|player\.)?kick\.com$/i.test(url.hostname)) {
      addKick(token);
    }
  }
  return out;
}

function toUrl(token: string): URL | null {
  if (!/[./]/.test(token)) return null;
  try {
    return new URL(/^https?:\/\//i.test(token) ? token : `https://${token}`);
  } catch {
    return null;
  }
}
