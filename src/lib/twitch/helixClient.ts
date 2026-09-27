import { TwitchApiError } from './types';

export const HELIX_BASE = 'https://api.twitch.tv/helix';

export interface HelixPage<T> {
  data: T[];
  pagination?: { cursor?: string };
  total?: number;
}

export type QueryValue = string | number | boolean | undefined | readonly string[];

export interface HelixClientOptions {
  clientId: string;
  getToken: () => string | null;
  /** Called when Twitch answers 401 (token expired or revoked). */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** Thin, typed wrapper around Helix: auth headers, pagination, 401/429 handling. */
export class HelixClient {
  private readonly opts: HelixClientOptions;

  constructor(opts: HelixClientOptions) {
    this.opts = opts;
  }

  async get<T>(path: string, query: Record<string, QueryValue> = {}): Promise<HelixPage<T>> {
    const token = this.opts.getToken();
    if (!token) throw new TwitchApiError(401, 'Not logged in');
    const url = `${HELIX_BASE}${path}?${toSearchParams(query).toString()}`;
    const doFetch = this.opts.fetch ?? fetch;
    const request = () =>
      doFetch(url, {
        headers: { 'Client-Id': this.opts.clientId, Authorization: `Bearer ${token}` },
      });

    let res = await request();
    if (res.status === 429) {
      await (this.opts.sleep ?? defaultSleep)(retryDelay(res));
      res = await request();
    }
    if (res.status === 401) {
      this.opts.onUnauthorized?.();
      throw new TwitchApiError(401, 'Twitch session expired');
    }
    if (!res.ok) {
      let message = `Twitch API error ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // keep default message
      }
      throw new TwitchApiError(res.status, message);
    }
    return (await res.json()) as HelixPage<T>;
  }

  /** Follows `pagination.cursor` until exhausted (or `maxPages`). */
  async getAll<T>(
    path: string,
    query: Record<string, QueryValue> = {},
    maxPages = 50,
  ): Promise<T[]> {
    const out: T[] = [];
    let after: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<T>(path, { ...query, first: 100, after });
      out.push(...res.data);
      after = res.pagination?.cursor;
      if (!after || res.data.length === 0) break;
    }
    return out;
  }
}

function toSearchParams(query: Record<string, QueryValue>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, String(value));
  }
  return params;
}

function retryDelay(res: Response): number {
  const reset = Number(res.headers.get('Ratelimit-Reset'));
  if (!reset) return 1000;
  return Math.min(10_000, Math.max(250, reset * 1000 - Date.now()));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Splits an array into chunks (Helix accepts up to 100 ids/logins per call). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
