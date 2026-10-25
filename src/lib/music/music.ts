import { normalizeLogin } from '../channels/parseChannels';
import type { ViewState } from '../view/types';

export interface MusicPreferences {
  channels: string[];
  mode: 'off' | 'auto' | 'pinned';
  pinned: string | null;
  volume: number;
  mixWithStreams: boolean;
  muted: boolean;
}

export const DEFAULT_MUSIC: MusicPreferences = {
  channels: [],
  mode: 'off',
  pinned: null,
  volume: 0.35,
  mixWithStreams: false,
  muted: false,
};

export interface MusicPlayback extends MusicPreferences {
  /** Automatic selection; not saved in presets or share links. */
  current: string | null;
}

export function sanitizeMusic(input: unknown): MusicPreferences {
  const p = input && typeof input === 'object' ? (input as Partial<MusicPreferences>) : {};
  const channels = Array.isArray(p.channels)
    ? [...new Set(p.channels.map((c) => (typeof c === 'string' ? normalizeLogin(c) : null)))]
        .filter((c): c is string => !!c)
        .slice(0, 50)
    : [];
  const pinned = typeof p.pinned === 'string' ? normalizeLogin(p.pinned) : null;
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
): string | null {
  if (!known) return current && channels.includes(current) ? current : null;
  return channels.find((c) => live.has(c)) ?? null;
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
  ].filter((c) => c !== channel);
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
