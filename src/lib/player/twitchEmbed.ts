import type {
  PlayerAdapter,
  PlayerEvent,
  PlayerFactory,
  PlayerPlaybackStats,
  PlayerQuality,
} from './types';

const SCRIPT_URL = 'https://player.twitch.tv/js/embed/v1.js';

/** Subset of the (unofficially typed) Twitch.Player API that we use. */
interface TwitchPlayerInstance {
  addEventListener(event: string, cb: () => void): void;
  removeEventListener?(event: string, cb: () => void): void;
  setMuted(m: boolean): void;
  getMuted(): boolean;
  setVolume(v: number): void;
  getVolume(): number;
  getQualities(): { group: string; name: string; height: number }[];
  getQuality(): string;
  setQuality(q: string): void;
  play(): void;
  pause(): void;
  isPaused(): boolean;
  getPlaybackStats(): PlayerPlaybackStats;
}

interface TwitchPlayerConstructor {
  new (id: string, options: Record<string, unknown>): TwitchPlayerInstance;
  READY: string;
  PLAYING: string;
  PAUSE: string;
  OFFLINE: string;
  ONLINE: string;
  ENDED: string;
  PLAYBACK_BLOCKED: string;
}

declare global {
  interface Window {
    Twitch?: { Player?: TwitchPlayerConstructor };
  }
}

let scriptPromise: Promise<TwitchPlayerConstructor> | null = null;

/** Loads Twitch's player script once and resolves with `Twitch.Player`. */
export function loadTwitchPlayer(): Promise<TwitchPlayerConstructor> {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch.Player);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.Twitch?.Player
        ? resolve(window.Twitch.Player)
        : reject(new Error('Twitch player script loaded without Twitch.Player'));
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error('Could not load the Twitch player (offline or blocked?)'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let nextId = 0;

/**
 * Wraps Twitch.Player. Its constructor needs the script to be loaded, so calls
 * made before then are queued and replayed once the player exists.
 */
class TwitchEmbedAdapter implements PlayerAdapter {
  private player: TwitchPlayerInstance | null = null;
  private ready = false;
  private destroyed = false;
  private readonly listeners = new Map<PlayerEvent, Set<() => void>>();
  private pending: ((p: TwitchPlayerInstance) => void)[] = [];
  private readonly host: HTMLElement;

  constructor(host: HTMLElement, channel: string, muted: boolean) {
    this.host = host;
    const mount = document.createElement('div');
    mount.id = `twitch-player-${++nextId}`;
    mount.style.width = '100%';
    mount.style.height = '100%';
    host.appendChild(mount);

    loadTwitchPlayer()
      .then((Player) => {
        if (this.destroyed) return;
        const player = new Player(mount.id, {
          channel,
          width: '100%',
          height: '100%',
          parent: [window.location.hostname],
          autoplay: true,
          muted,
        });
        this.player = player;
        const map: [string, PlayerEvent][] = [
          [Player.READY, 'ready'],
          [Player.PLAYING, 'playing'],
          [Player.PAUSE, 'pause'],
          [Player.OFFLINE, 'offline'],
          [Player.ONLINE, 'online'],
          [Player.ENDED, 'ended'],
          [Player.PLAYBACK_BLOCKED, 'blocked'],
        ];
        for (const [twitchEvent, event] of map) {
          player.addEventListener(twitchEvent, () => {
            if (event === 'ready') {
              this.ready = true;
              const queued = this.pending;
              this.pending = [];
              queued.forEach((fn) => fn(player));
            }
            this.listeners.get(event)?.forEach((h) => h());
          });
        }
      })
      .catch((err) => {
        console.error(err);
        host.dataset.error = String(err.message ?? err);
      });
  }

  private call(fn: (p: TwitchPlayerInstance) => void) {
    if (this.player && this.ready) safe(() => fn(this.player!));
    else this.pending.push(fn);
  }

  private read<T>(fn: (p: TwitchPlayerInstance) => T, fallback: T): T {
    if (!this.player || !this.ready) return fallback;
    try {
      return fn(this.player);
    } catch {
      return fallback;
    }
  }

  setMuted = (m: boolean) => this.call((p) => p.setMuted(m));
  getMuted = () => this.read((p) => p.getMuted(), true);
  setVolume = (v: number) => this.call((p) => p.setVolume(v));
  getVolume = () => this.read((p) => p.getVolume(), 0.5);
  getQualities = (): PlayerQuality[] =>
    this.read(
      (p) => p.getQualities().map((q) => ({ group: q.group, name: q.name, height: q.height })),
      [],
    );
  getQuality = () => this.read((p) => p.getQuality(), 'auto');
  setQuality = (q: string) => this.call((p) => p.setQuality(q));
  play = () => this.call((p) => p.play());
  pause = () => this.call((p) => p.pause());
  isPaused = () => this.read((p) => p.isPaused(), false);
  getPlaybackStats = () => this.read((p) => p.getPlaybackStats(), null);

  on(event: PlayerEvent, handler: () => void) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(handler);
    return () => void set.delete(handler);
  }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
    this.pending = [];
    this.player = null;
    this.host.replaceChildren();
  }
}

function safe(fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.warn('[twitch player]', err);
  }
}

export const twitchPlayerFactory: PlayerFactory = {
  create: (host, { channel, muted }) => new TwitchEmbedAdapter(host, channel, muted),
};
