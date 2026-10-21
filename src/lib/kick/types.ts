/** App-level Kick models (decoupled from Kick's response shapes). */

export interface KickChannel {
  /** Kick's channel name in URLs (kick.com/<slug>). */
  slug: string;
  isLive: boolean;
  title: string;
  categoryName: string;
  viewerCount: number;
  /** ISO timestamp, when live. */
  startedAt: string;
  thumbnailUrl: string;
}

/**
 * What the app needs from Kick: the live status of the channels you linked.
 * Implemented by the official public API client and by an in-memory mock.
 */
export interface KickApi {
  getChannels(slugs: readonly string[]): Promise<KickChannel[]>;
}

/** Linked accounts: Twitch login → the same streamer's Kick slug. */
export type KickLinks = Record<string, string>;

export class KickApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'KickApiError';
    this.status = status;
  }
}
