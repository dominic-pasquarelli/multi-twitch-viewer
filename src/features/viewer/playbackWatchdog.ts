import type { PlayerStatus } from '@/lib/player/types';

export interface WatchdogSample {
  ready: boolean;
  status: PlayerStatus;
  paused: boolean;
  live?: boolean;
  held: boolean;
  online: boolean;
}

/** Keeps retrying without a busy loop, including players that omit pause events. */
export class PlaybackWatchdog {
  private stoppedAt: number | null = null;
  private lastPlay = -Infinity;
  private lastReload = -Infinity;
  constructor(private readonly now: () => number = Date.now) {}

  check(s: WatchdogSample): 'play' | 'reload' | null {
    const now = this.now();
    if (s.held || !s.online || s.live === false) {
      this.stoppedAt = null;
      return null;
    }
    if (s.status === 'playing' && !s.paused) {
      this.stoppedAt = null;
      return null;
    }
    // An offline player is retried only after the API confirms it is live.
    if ((s.status === 'offline' || s.status === 'ended') && s.live !== true) return null;
    this.stoppedAt ??= now;
    if (now - this.stoppedAt >= 30_000 && now - this.lastReload >= 60_000) {
      this.lastReload = now;
      return 'reload';
    }
    if (s.ready && now - this.lastPlay >= 5_000) {
      this.lastPlay = now;
      return 'play';
    }
    return null;
  }
}
