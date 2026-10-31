import { kickPlayerUrl } from '../kick/links';
import type { PlayerAdapter, PlayerEvent, PlayerFactory, PlayerQuality } from './types';

export interface KickPlayerState {
  paused: boolean;
  muted: boolean;
  volume: number;
}

export interface KickPlayerCommand {
  muted?: boolean;
  volume?: number;
  play?: boolean;
  pause?: boolean;
}

/**
 * Desktop app only: applies a command to the video inside the Kick player
 * frame with this id and returns its state (null while it has no video).
 */
export type KickPlayerControl = (
  id: string,
  command: KickPlayerCommand,
) => Promise<KickPlayerState | null>;

let nextId = 0;

/**
 * Kick's embedded player. It has no JavaScript API, only `muted` and
 * `autoplay` URL parameters:
 * - with `control` (the desktop app reaching into the frame), mute, volume,
 *   play and pause work like Twitch's. The app's mute and volume are sent
 *   again every second: Kick's player restores its own volume after an
 *   unmute, and the app stays in charge (Kick's own sliders don't stick);
 * - without it (a normal browser), changing mute reloads the player, pausing
 *   unloads it, and volume can't be set (see PlayerFactory.capabilities).
 */
class KickEmbedAdapter implements PlayerAdapter {
  private muted: boolean;
  private volume = 0.5;
  private paused = false;
  private frame: HTMLIFrameElement | null = null;
  private readonly id = `k${Date.now().toString(36)}${++nextId}`;
  private poll: ReturnType<typeof setInterval> | undefined;
  private reported: 'playing' | 'pause' | null = null;
  private destroyed = false;
  private initialized = false;
  private sending = false;
  private commandPending = false;
  private commandVersion = 0;
  private playbackIntent: 'play' | 'pause' | null = null;
  private readonly listeners = new Map<PlayerEvent, Set<() => void>>();
  private readonly host: HTMLElement;
  private readonly slug: string;
  private readonly control?: KickPlayerControl;

  constructor(host: HTMLElement, slug: string, muted: boolean, control?: KickPlayerControl) {
    this.host = host;
    this.slug = slug;
    this.muted = muted;
    this.control = control;
    // Nothing to wait for: report ready at once, so the app's first settings
    // (e.g. unmuted) decide how the player loads.
    queueMicrotask(() => {
      if (this.destroyed) return;
      this.initialized = true;
      this.emit('ready');
      if (!this.destroyed && (this.control || !this.paused) && !this.frame) this.load();
    });
  }

  private emit(event: PlayerEvent) {
    this.listeners.get(event)?.forEach((h) => h());
  }

  private report(state: 'playing' | 'pause') {
    if (this.reported === state) return;
    this.reported = state;
    this.emit(state);
  }

  private load() {
    this.frame?.remove();
    const frame = document.createElement('iframe');
    frame.src = kickPlayerUrl(this.slug, { muted: this.muted, id: this.id });
    frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    frame.title = `${this.slug} on Kick`;
    frame.dataset.kickPlayer = this.slug;
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
    if (!this.control)
      frame.addEventListener('load', () => {
        if (!this.destroyed && this.frame === frame) this.report('playing');
      });
    this.host.appendChild(frame);
    this.frame = frame;
    if (this.control && !this.poll) this.poll = setInterval(() => this.send(), 1000);
    this.send();
  }

  private unload() {
    this.frame?.remove();
    this.frame = null;
    this.report('pause');
  }

  /** Desktop: applies the app's mute and volume (plus a command) and reads play state. */
  private send() {
    if (this.destroyed || !this.control) return;
    this.commandPending = true;
    if (this.frame && !this.sending) void this.flushCommands();
  }

  /** One request at a time: slow replies cannot undo newer audio/pause intent. */
  private async flushCommands() {
    this.sending = true;
    try {
      while (!this.destroyed && this.frame && this.commandPending) {
        this.commandPending = false;
        const version = this.commandVersion;
        const intent = this.playbackIntent;
        const state = await this.control!(this.id, {
          muted: this.muted,
          volume: this.volume,
          ...(intent ? { [intent]: true } : {}),
        }).catch(() => null);
        if (this.destroyed) return;
        // Retain play/pause until a video exists. Retry on the next tick,
        // without spinning while a channel is offline or still loading.
        if (!state || version !== this.commandVersion) continue;
        this.playbackIntent = null;
        this.paused = state.paused;
        this.report(state.paused ? 'pause' : 'playing');
      }
    } finally {
      this.sending = false;
    }
  }

  setMuted(m: boolean) {
    if (this.control) {
      if (this.muted !== m) this.commandVersion++;
      this.muted = m;
      this.send();
      return;
    }
    if (m === this.muted) return;
    this.muted = m;
    if (this.frame) this.load(); // the only way to (un)mute an embed
  }
  getMuted = () => this.muted;
  setVolume(v: number) {
    if (this.volume !== v) this.commandVersion++;
    this.volume = v;
    this.send();
  }
  getVolume = () => this.volume;
  getQualities = (): PlayerQuality[] => [];
  getQuality = () => 'auto';
  setQuality() {}
  play() {
    if (this.destroyed) return;
    if (this.control) {
      this.playbackIntent = 'play';
      this.commandVersion++;
      this.send();
    } else {
      this.paused = false;
      if (this.initialized && !this.frame) this.load();
    }
  }
  pause() {
    if (this.destroyed) return;
    if (this.control) {
      this.playbackIntent = 'pause';
      this.commandVersion++;
      this.send();
    } else {
      this.paused = true;
      this.unload();
    }
  }
  isPaused = () => (this.control ? this.paused : !this.frame);

  on(event: PlayerEvent, handler: () => void) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(handler);
    return () => void set.delete(handler);
  }

  destroy() {
    this.destroyed = true;
    clearInterval(this.poll);
    this.listeners.clear();
    this.frame?.remove();
    this.frame = null;
  }
}

/** Kick players; pass the desktop app's frame control for full control. */
export function createKickPlayerFactory(control?: KickPlayerControl): PlayerFactory {
  return {
    capabilities: { volume: !!control, playbackState: !!control },
    create: (host, { channel, muted }) => new KickEmbedAdapter(host, channel, muted, control),
  };
}
