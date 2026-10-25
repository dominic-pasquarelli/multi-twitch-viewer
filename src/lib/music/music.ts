import { normalizeChannel } from '../channels/parseChannels';
import type { ViewState } from '../view/types';

export interface MusicPreferences {
  channels: string[];
  mode: 'off' | 'auto' | 'pinned';
  pinned: string | null;
  volume: number;
  mixWithStreams: boolean;
  muted: boolean;
  musicOnly: boolean;
  keepCurrent: boolean;
  fadeSeconds: number;
  trims: Record<string, number>;
}

export const DEFAULT_MUSIC: MusicPreferences = {
  channels: [],
  mode: 'off',
  pinned: null,
  volume: 0.35,
  mixWithStreams: false,
  muted: false,
  musicOnly: false,
  keepCurrent: false,
  fadeSeconds: 0,
  trims: {},
};

export interface MusicPlayback extends MusicPreferences {
  /** Automatic selection; not saved in presets or share links. */
  current: string | null;
}

export function sanitizeMusic(input: unknown): MusicPreferences {
  const p = input && typeof input === 'object' ? (input as Partial<MusicPreferences>) : {};
  const channels = Array.isArray(p.channels)
    ? [...new Set(p.channels.map((c) => (typeof c === 'string' ? normalizeChannel(c) : null)))]
        .filter((c): c is string => !!c)
        .slice(0, 50)
    : [];
  const pinned = typeof p.pinned === 'string' ? normalizeChannel(p.pinned) : null;
  return {
    channels,
    pinned,
    mode: p.mode === 'auto' ? 'auto' : p.mode === 'pinned' && pinned ? 'pinned' : 'off',
    volume:
      typeof p.volume === 'number' && Number.isFinite(p.volume)
        ? Math.min(1, Math.max(0, p.volume))
        : DEFAULT_MUSIC.volume,
    mixWithStreams: p.mixWithStreams === true,
    muted: p.muted === true,
    musicOnly: p.musicOnly === true,
    keepCurrent: p.keepCurrent === true,
    fadeSeconds:
      typeof p.fadeSeconds === 'number' && Number.isFinite(p.fadeSeconds)
        ? Math.max(0, Math.min(5, p.fadeSeconds))
        : 0,
    trims: Object.fromEntries(
      Object.entries(p.trims && typeof p.trims === 'object' ? p.trims : {})
        .filter(
          ([login, trim]) =>
            normalizeChannel(login) === login &&
            typeof trim === 'number' &&
            Number.isFinite(trim) &&
            trim >= 0.25 &&
            trim <= 2,
        )
        .slice(0, 500),
    ),
  };
}

export const activeMusicChannel = (music: MusicPlayback): string | null =>
  music.mode === 'pinned' ? music.pinned : music.mode === 'auto' ? music.current : null;

/** Keep playing through unknown/error results; only confirmed status may switch DJs. */
export function chooseMusicChannel(
  channels: readonly string[],
  live: ReadonlySet<string>,
  known: boolean,
  current: string | null,
  options: { keepCurrent?: boolean; skipped?: readonly string[] } = {},
): string | null {
  const eligible = channels.filter((c) => !options.skipped?.includes(c));
  if (!known) return current && eligible.includes(current) ? current : null;
  if (options.keepCurrent && current && eligible.includes(current) && live.has(current))
    return current;
  return eligible.find((c) => live.has(c)) ?? null;
}

/**
 * Project music into playback without editing the watched view, presets or URL.
 * A DJ already on screen reuses its player; an automatic extra leaves when music stops.
 */
export function withMusic(view: ViewState, music: MusicPlayback): ViewState {
  if (music.mode === 'off') return view;
  const channel = activeMusicChannel(music);
  const channels =
    channel && !view.channels.includes(channel) ? [...view.channels, channel] : view.channels;
  const suppressed = [
    ...new Set([...music.channels, ...(music.pinned ? [music.pinned] : [])]),
  ].filter((c) => c !== channel && !view.audio.active.includes(c));
  if (channel && music.muted) suppressed.push(channel);
  const active = music.mixWithStreams
    ? view.audio.active.filter((c) => c !== channel && !suppressed.includes(c))
    : [];
  if (channel && !music.muted) active.push(channel);
  return {
    ...view,
    channels,
    // Music stays visible/playing even when a different group is isolated.
    groups:
      channel && view.activeGroup
        ? view.groups?.map((g) =>
            g.id === view.activeGroup
              ? { ...g, channels: [...new Set([...g.channels, channel])] }
              : g,
          )
        : view.groups,
    audio: {
      ...view.audio,
      mode: music.mixWithStreams ? view.audio.mode : 'mix',
      active,
      suppressed,
    },
  };
}
