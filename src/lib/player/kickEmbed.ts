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
      this.emit('ready');
      this.load();
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
    if (!this.control) frame.addEventListener('load', () => this.report('playing'));
    this.host.appendChild(frame);
    this.frame = frame;
    if (this.control && !this.poll) this.poll = setInterval(() => void this.send(), 1000);
  }

  private unload() {
    this.frame?.remove();
    this.frame = null;
    this.report('pause');
  }

  /** Desktop: applies the app's mute and volume (plus a command) and reads play state. */
  private async send(command: KickPlayerCommand = {}) {
    if (!this.control || !this.frame) return;
    const state = await this.control(this.id, {
      muted: this.muted,
      volume: this.volume,
      ...command,
    }).catch(() => null);
    if (!state || this.destroyed) return;
    this.paused = state.paused;
    this.report(state.paused ? 'pause' : 'playing');
  }

  setMuted(m: boolean) {
    if (this.control) {
      this.muted = m;
      void this.send();
      return;
    }
    if (m === this.muted) return;
    this.muted = m;
    if (this.frame) this.load(); // the only way to (un)mute an embed
  }
  getMuted = () => this.muted;
  setVolume(v: number) {
    this.volume = v;
    void this.send();
  }
  getVolume = () => this.volume;
  getQualities = (): PlayerQuality[] => [];
  getQuality = () => 'auto';
  setQuality() {}
  play() {
    if (this.control) void this.send({ play: true });
    else if (!this.frame) this.load();
  }
  pause() {
    if (this.control) void this.send({ pause: true });
    else this.unload();
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
    capabilities: { volume: !!control },
    create: (host, { channel, muted }) => new KickEmbedAdapter(host, channel, muted, control),
  };
}
