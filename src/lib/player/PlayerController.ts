import type { PlayerAdapter, PlayerStatus } from './types';
import { pickQualityAtMost } from './quality';

export interface DesiredPlayerState {
  muted: boolean;
  /** null = leave the player's own volume alone. */
  volume: number | null;
  /** null = let Twitch choose ("auto"). */
  quality: string | null;
}

export interface PlayerControllerCallbacks {
  onStatus?(status: PlayerStatus): void;
  /** The user muted/unmuted using the player's own controls. */
  onExternalMute?(muted: boolean): void;
  /** The user changed the volume using the player's own controls. */
  onExternalVolume?(volume: number): void;
}

export interface PlayerControllerOptions {
  /** Ignore differences this soon after we sent a command (it may not have applied yet). */
  graceMs?: number;
  now?: () => number;
}

/**
 * Keeps a player in line with the state the app wants (muted, volume,
 * quality) and notices when the user changes things with the player's own
 * controls, so the app can react (e.g. unmuting one stream mutes the others).
 * Call `sync()` periodically; it only reads cached values, so it is cheap.
 */
export class PlayerController {
  private desired: DesiredPlayerState;
  private ready = false;
  private lastCommandAt = -Infinity;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly graceMs: number;
  private readonly now: () => number;
  private readonly adapter: PlayerAdapter;
  private readonly callbacks: PlayerControllerCallbacks;
  private recoveryQualityCap: number | null = null;
  private appliedQuality: string | undefined;
  status: PlayerStatus = 'loading';

  constructor(
    adapter: PlayerAdapter,
    initial: DesiredPlayerState,
    callbacks: PlayerControllerCallbacks = {},
    options: PlayerControllerOptions = {},
  ) {
    this.adapter = adapter;
    this.callbacks = callbacks;
    this.desired = { ...initial };
    this.graceMs = options.graceMs ?? 1500;
    this.now = options.now ?? (() => Date.now());

    const setStatus = (s: PlayerStatus) => {
      this.status = s;
      callbacks.onStatus?.(s);
    };
    this.unsubscribers.push(
      adapter.on('ready', () => {
        this.ready = true;
        // On first apply, "no preference" means: leave the player's quality alone.
        this.apply({ ...this.desired, quality: this.desired.quality ?? undefined });
      }),
      adapter.on('playing', () => setStatus('playing')),
      adapter.on('online', () => setStatus('loading')),
      adapter.on('pause', () => setStatus('paused')),
      adapter.on('offline', () => setStatus('offline')),
      adapter.on('ended', () => setStatus('ended')),
      adapter.on('blocked', () => setStatus('blocked')),
    );
  }

  get isReady() {
    return this.ready;
  }

  update(next: Partial<DesiredPlayerState>) {
    const changed: Partial<DesiredPlayerState> = {};
    for (const key of Object.keys(next) as (keyof DesiredPlayerState)[]) {
      if (next[key] !== undefined && next[key] !== this.desired[key]) {
        (changed as Record<string, unknown>)[key] = next[key];
      }
    }
    this.desired = { ...this.desired, ...changed };
    if (this.ready && Object.keys(changed).length) this.apply(changed);
  }

  private apply(state: Partial<DesiredPlayerState>) {
    this.lastCommandAt = this.now();
    if (state.volume !== undefined && state.volume !== null) this.adapter.setVolume(state.volume);
    if (state.muted !== undefined) this.adapter.setMuted(state.muted);
    if (state.quality !== undefined || this.recoveryQualityCap !== null) this.applyQuality();
  }

  /** Temporarily limits bandwidth without replacing the user's quality preference. */
  setRecoveryQualityCap(height: number | null) {
    if (height === this.recoveryQualityCap && height === null) return;
    this.recoveryQualityCap = height;
    if (this.ready) this.applyQuality();
  }

  private applyQuality() {
    let quality = this.desired.quality ?? 'auto';
    if (this.recoveryQualityCap !== null) {
      const qualities = this.adapter.getQualities();
      const desiredHeight = qualities.find((q) => q.group === quality)?.height;
      const cap = Math.min(this.recoveryQualityCap, desiredHeight || Infinity);
      quality = pickQualityAtMost(qualities, cap) ?? 'auto';
    }
    if (quality === this.appliedQuality) return;
    this.lastCommandAt = this.now();
    this.appliedQuality = quality;
    this.adapter.setQuality(quality);
  }

  /** Compares the player with the desired state and reports external changes. */
  sync() {
    if (!this.ready || this.now() - this.lastCommandAt < this.graceMs) return;
    const muted = this.adapter.getMuted();
    if (muted !== this.desired.muted) {
      this.desired.muted = muted;
      this.callbacks.onExternalMute?.(muted);
    }
    const volume = this.adapter.getVolume();
    if (this.desired.volume === null || Math.abs(volume - this.desired.volume) > 0.01) {
      const wasUnset = this.desired.volume === null;
      this.desired.volume = volume;
      if (!wasUnset || volume > 0) this.callbacks.onExternalVolume?.(volume);
    }
  }

  /** Re-applies the desired state (e.g. after the user clicked to allow audio). */
  reapply() {
    if (this.ready) {
      this.appliedQuality = undefined;
      this.apply(this.desired);
    }
  }

  dispose() {
    this.unsubscribers.forEach((u) => u());
  }
}
