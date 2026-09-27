/** Twitch logins are 1–25 letters, digits or underscores (stored lowercase). */
const LOGIN_RE = /^[a-z0-9_]{1,25}$/;

export const isValidLogin = (value: string): boolean => LOGIN_RE.test(value);

/** Lowercases and strips a leading "@". Returns null when it is not a valid login. */
export function normalizeLogin(raw: string): string | null {
  const login = raw.trim().replace(/^@/, '').toLowerCase();
  return isValidLogin(login) ? login : null;
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
export function parseChannelInput(input: string): string[] {
  const out: string[] = [];
  const add = (value: string | undefined) => {
    const login = value ? normalizeLogin(value) : null;
    if (login && !out.includes(login)) out.push(login);
  };

  for (const token of input.split(/[\s,;]+/).filter(Boolean)) {
    const url = toUrl(token);
    if (!url) {
      add(token);
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
