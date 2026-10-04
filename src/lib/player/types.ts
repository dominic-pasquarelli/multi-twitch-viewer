export interface PlayerQuality {
  /** Value accepted by setQuality, e.g. "chunked" (source) or "720p60". */
  group: string;
  /** Human readable, e.g. "1080p60 (Source)". */
  name: string;
  height: number;
}

/** Documented Twitch playback telemetry; individual fields may be unavailable. */
export interface PlayerPlaybackStats {
  bufferSize?: number;
  fps?: number;
  skippedFrames?: number;
  playbackRate?: number;
}

export type PlayerEvent =
  'ready' | 'playing' | 'pause' | 'offline' | 'online' | 'blocked' | 'ended';

export type PlayerStatus = 'loading' | 'playing' | 'paused' | 'offline' | 'blocked' | 'ended';

/**
 * What the app needs from a video player. The Twitch embed implements it, and
 * so does a fake player used in mock mode and tests.
 */
export interface PlayerAdapter {
  setMuted(muted: boolean): void;
  getMuted(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;
  getQualities(): PlayerQuality[];
  getQuality(): string;
  setQuality(group: string): void;
  play(): void;
  pause(): void;
  isPaused?(): boolean;
  getPlaybackStats?(): PlayerPlaybackStats | null;
  on(event: PlayerEvent, handler: () => void): () => void;
  /** Removes the player from the page. */
  destroy(): void;
}

export interface CreatePlayerOptions {
  channel: string;
  muted: boolean;
}

export interface PlayerFactory {
  create(host: HTMLElement, options: CreatePlayerOptions): PlayerAdapter;
}
