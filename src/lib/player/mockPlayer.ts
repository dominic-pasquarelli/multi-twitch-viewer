import type { PlayerAdapter, PlayerEvent, PlayerFactory, PlayerQuality } from './types';

const QUALITIES: PlayerQuality[] = [
  { group: 'chunked', name: '1080p60 (Source)', height: 1080 },
  { group: '720p60', name: '720p60', height: 720 },
  { group: '480p30', name: '480p', height: 480 },
  { group: '360p30', name: '360p', height: 360 },
  { group: '160p30', name: '160p', height: 160 },
];

export interface MockPlayerOptions {
  isLive?: (channel: string) => boolean;
  hueFor?: (channel: string) => number;
  /** ms before 'ready' fires; 0 = synchronous (tests). */
  readyDelay?: number;
}

/**
 * A stand-in for the Twitch player: a coloured animated box showing the channel
 * name and its current audio state. Used by mock mode and tests.
 */
export class MockPlayer implements PlayerAdapter {
  muted: boolean;
  volume = 0.5;
  quality = 'auto';
  paused = false;
  readonly channel: string;
  readonly el: HTMLDivElement;
  private readonly listeners = new Map<PlayerEvent, Set<() => void>>();
  private readonly label: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(host: HTMLElement, channel: string, muted: boolean, opts: MockPlayerOptions = {}) {
    this.channel = channel;
    this.muted = muted;
    const live = opts.isLive?.(channel) ?? true;
    const hue = opts.hueFor?.(channel) ?? 265;
    this.el = document.createElement('div');
    this.el.className = 'mock-player';
    this.el.dataset.channel = channel;
    this.el.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:#fff;container-type:size;font:600 clamp(11px,7cqw,30px)/1.2 system-ui,sans-serif;text-align:center;overflow:hidden;background:${
      live
        ? `linear-gradient(135deg,hsl(${hue} 65% 38%),hsl(${(hue + 70) % 360} 65% 18%))`
        : '#18181b'
    };`;
    const name = document.createElement('div');
    name.textContent = live ? channel : `${channel} is offline`;
    this.label = document.createElement('div');
    this.label.style.cssText = 'font-size:13px;font-weight:500;opacity:.85';
    this.el.append(name, this.label);
    host.appendChild(this.el);
    this.render();

    const start = () => {
      this.emit('ready');
      this.emit(live ? 'playing' : 'offline');
    };
    const delay = opts.readyDelay ?? 300;
    if (delay === 0) queueMicrotask(start);
    else this.timer = setTimeout(start, delay);
  }

  private render() {
    this.label.textContent = `${this.muted ? '🔇 muted' : `🔊 ${Math.round(this.volume * 100)}%`} · mock player`;
    this.el.dataset.muted = String(this.muted);
    this.el.dataset.volume = this.volume.toFixed(2);
    this.el.dataset.paused = String(this.paused);
  }

  emit(event: PlayerEvent) {
    this.listeners.get(event)?.forEach((h) => h());
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.render();
  }
  getMuted = () => this.muted;
  setVolume(v: number) {
    this.volume = v;
    this.render();
  }
  getVolume = () => this.volume;
  getQualities = () => QUALITIES;
  getQuality = () => this.quality;
  setQuality(q: string) {
    this.quality = q;
    this.el.dataset.quality = q;
  }
  play() {
    this.paused = false;
    this.render();
    this.emit('playing');
  }
  pause() {
    this.paused = true;
    this.render();
    this.emit('pause');
  }
  on(event: PlayerEvent, handler: () => void) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(handler);
    return () => void set.delete(handler);
  }
  destroy() {
    clearTimeout(this.timer);
    this.listeners.clear();
    this.el.remove();
  }
}

export const createMockPlayerFactory = (
  opts: MockPlayerOptions = {},
): PlayerFactory & {
  instances: MockPlayer[];
} => {
  const instances: MockPlayer[] = [];
  return {
    instances,
    create(host, { channel, muted }) {
      const p = new MockPlayer(host, channel, muted, opts);
      instances.push(p);
      return p;
    },
  };
};
