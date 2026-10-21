import { chunk } from '../twitch/helixClient';
import { KickApiError, type KickApi, type KickChannel } from './types';

export const KICK_API_BASE = 'https://api.kick.com/public/v1';
export const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';

interface KickApiChannel {
  slug: string;
  stream_title?: string;
  category?: { name?: string } | null;
  stream?: {
    is_live?: boolean;
    viewer_count?: number;
    start_time?: string;
    thumbnail?: string;
  } | null;
}

export interface KickApiOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * Kick's official public API with an app access token (client credentials:
 * your Kick app's Client ID and Secret). The token is cached until shortly
 * before it expires and fetched again once if Kick rejects it.
 */
export function createKickApi(opts: KickApiOptions): KickApi {
  const doFetch = (...args: Parameters<typeof fetch>) => (opts.fetch ?? fetch)(...args);
  const now = opts.now ?? Date.now;
  let token: { value: Promise<string>; expiresAt: number } | null = null;

  const signIn = async (): Promise<{ value: string; ttlMs: number }> => {
    const res = await doFetch(KICK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
      }).toString(),
    });
    if (!res.ok)
      throw new KickApiError(
        res.status,
        res.status === 401 || res.status === 400
          ? 'Kick rejected the Client ID or Secret'
          : `Kick sign-in failed (${res.status})`,
      );
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new KickApiError(500, 'Kick returned no access token');
    // expires_in is in seconds.
    return {
      value: body.access_token,
      ttlMs: Math.max(120, Number(body.expires_in) || 3600) * 1000,
    };
  };

  // Concurrent requests share one sign-in; a failed one is retried next time.
  const getToken = (): Promise<string> => {
    if (token && now() < token.expiresAt) return token.value;
    const entry = { value: Promise.resolve(''), expiresAt: Infinity };
    entry.value = signIn().then(
      ({ value, ttlMs }) => {
        entry.expiresAt = now() + ttlMs - 60_000; // renew a minute early
        return value;
      },
      (err: unknown) => {
        if (token === entry) token = null;
        throw err;
      },
    );
    token = entry;
    return entry.value;
  };

  const getPage = async (slugs: string[], retried = false): Promise<KickApiChannel[]> => {
    const query = new URLSearchParams();
    slugs.forEach((slug) => query.append('slug', slug));
    const res = await doFetch(`${KICK_API_BASE}/channels?${query.toString()}`, {
      headers: { Authorization: `Bearer ${await getToken()}`, Accept: 'application/json' },
    });
    if (res.status === 401 && !retried) {
      token = null; // revoked or expired early: sign in again once
      return getPage(slugs, true);
    }
    if (!res.ok) throw new KickApiError(res.status, `Kick API error ${res.status}`);
    return ((await res.json()) as { data?: KickApiChannel[] }).data ?? [];
  };

  return {
    async getChannels(slugs) {
      if (!slugs.length) return [];
      // Up to 50 slugs per request.
      const pages = await Promise.all(chunk([...new Set(slugs)], 50).map((page) => getPage(page)));
      return pages.flat().map(toKickChannel);
    },
  };
}

function toKickChannel(c: KickApiChannel): KickChannel {
  return {
    slug: c.slug.toLowerCase(),
    isLive: c.stream?.is_live === true,
    title: c.stream_title ?? '',
    categoryName: c.category?.name ?? '',
    viewerCount: c.stream?.viewer_count ?? 0,
    startedAt: isoTime(c.stream?.start_time),
    thumbnailUrl: c.stream?.thumbnail ?? '',
  };
}

/** Kick times may come as "2026-10-20 19:22:23" (UTC) instead of ISO. */
export function isoTime(value: string | undefined): string {
  if (!value) return '';
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}
