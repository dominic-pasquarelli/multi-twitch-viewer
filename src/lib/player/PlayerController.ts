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
  /** Keep delayed app-command echoes from rewriting the selected mix. */
  adoptExternalChange?: (
    kind: 'mute' | 'volume',
    value: number | boolean,
    recentCommand: boolean,
  ) => boolean;
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
  private readonly adoptExternalChange: NonNullable<PlayerControllerOptions['adoptExternalChange']>;
  // Common embed defaults are not evidence that a user changed a configured level.
  private previousVolumes: number[] = [0, 0.5, 1];
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
    this.adoptExternalChange = options.adoptExternalChange ?? (() => true);
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
      adapter.on('playing', () => {
        // A reconnect (or resumed video) can replace the embed's audio state
        // without another READY event. Restore intent before polling it.
        if (this.ready) this.applyAudio();
        setStatus('playing');
      }),
      adapter.on('online', () => {
        if (this.ready) this.applyAudio();
        setStatus('loading');
      }),
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
    // Mute/unmute may restore a player-side volume, so always send the current
    // level AFTER mute, even when only the mute flag changed.
    if (state.muted !== undefined) this.adapter.setMuted(state.muted);
    const volume = state.volume ?? (state.muted !== undefined ? this.desired.volume : null);
    if (volume !== null) {
      this.rememberVolume(volume);
      this.adapter.setVolume(volume);
    }
    if (state.quality !== undefined || this.recoveryQualityCap !== null) this.applyQuality();
  }

  private applyAudio() {
    this.apply({ muted: this.desired.muted, volume: this.desired.volume });
  }

  private rememberVolume(value: number) {
    // Retain the old output levels for this embed. A late 100%/duck-level echo
    // must not rewrite a new DJ or priority setting merely because time elapsed.
    this.previousVolumes = this.previousVolumes.filter(
      (previous) => Math.abs(previous - value) > 0.01,
    );
    this.previousVolumes.push(value);
    this.previousVolumes = this.previousVolumes.slice(-128);
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
    if (
      !this.ready ||
      ['loading', 'offline', 'ended', 'blocked'].includes(this.status) ||
      this.now() - this.lastCommandAt < this.graceMs
    )
      return;
    const muted = this.adapter.getMuted();
    if (muted !== this.desired.muted) {
      if (this.adoptExternalChange('mute', muted, false)) {
        this.desired.muted = muted;
        this.callbacks.onExternalMute?.(muted);
      } else {
        // Both fields may belong to the same delayed reset. Do not adopt its
        // volume as a new mix preference after rejecting its mute flag.
        this.applyAudio();
        return;
      }
    }
    const volume = this.adapter.getVolume();
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) return;
    // Zero while a player's level is still unknown is often muted/startup
    // telemetry. Latching it without notifying the app leaves the controller
    // restoring silence forever when the channel is later unmuted.
    if (this.desired.volume === null && volume === 0) return;
    if (this.desired.volume === null || Math.abs(volume - this.desired.volume) > 0.01) {
      if (
        this.desired.volume !== null &&
        !this.adoptExternalChange(
          'volume',
          volume,
          this.previousVolumes.some((previous) => Math.abs(previous - volume) <= 0.01),
        )
      ) {
        this.apply({ volume: this.desired.volume });
        return;
      }
      const wasUnset = this.desired.volume === null;
      this.desired.volume = volume;
      this.rememberVolume(volume);
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
