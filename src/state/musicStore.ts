import { markPlaybackTransition } from '@/lib/player/transitions';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeChannel } from '@/lib/channels/parseChannels';
import {
  DEFAULT_MUSIC,
  sanitizeMusic,
  type MusicPlayback,
  type MusicPreferences,
} from '@/lib/music/music';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

interface MusicStore extends MusicPlayback {
  paused: boolean;
  skipped: string[];
  update(patch: Partial<MusicPreferences>): void;
  skip(channel: string): void;
  unskip(channel: string): void;
  resetSkips(): void;
  setTrim(channel: string, trim: number): void;
  addChannels(channels: string[]): void;
  removeChannel(channel: string): void;
  moveChannel(channel: string, offset: number): void;
  setMode(mode: 'off' | 'auto'): void;
  pin(channel: string): void;
  setCurrent(channel: string | null): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setMixWithStreams(mix: boolean): void;
  setPaused(paused: boolean): void;
}

export const useMusicStore = create<MusicStore>()(
  persist(
    (set) => ({
      ...DEFAULT_MUSIC,
      current: null,
      paused: false,
      skipped: [],
      update: (patch) => set((s) => sanitizeMusic({ ...s, ...patch })),
      skip: (channel) => set((s) => ({ skipped: [...new Set([...s.skipped, channel])] })),
      unskip: (channel) => set((s) => ({ skipped: s.skipped.filter((c) => c !== channel) })),
      resetSkips: () => set({ skipped: [] }),
      setTrim: (channel, trim) =>
        set((s) => ({ trims: sanitizeMusic({ trims: { ...s.trims, [channel]: trim } }).trims })),
      addChannels: (channels) =>
        set((s) => ({
          channels: sanitizeMusic({ channels: [...s.channels, ...channels] }).channels,
        })),
      removeChannel: (channel) =>
        set((s) => ({
          channels: s.channels.filter((c) => c !== channel),
          ...(s.pinned === channel
            ? { pinned: null, ...(s.mode === 'pinned' ? { mode: 'off' as const } : {}) }
            : {}),
          ...(s.current === channel ? { current: null } : {}),
        })),
      moveChannel: (channel, offset) =>
        set((s) => {
          const i = s.channels.indexOf(channel);
          const j = i + offset;
          if (!Number.isInteger(offset) || i < 0 || j < 0 || j >= s.channels.length) return s;
          const channels = [...s.channels];
          [channels[i], channels[j]] = [channels[j]!, channels[i]!];
          return { channels };
        }),
      setMode: (mode) => {
        markPlaybackTransition();
        return set((s) =>
          s.mode === mode ? s : { mode, current: mode === 'auto' ? s.pinned : null, paused: false },
        );
      },
      pin: (raw) => {
        markPlaybackTransition();
        const pinned = normalizeChannel(raw);
        if (!pinned) return;
        set((s) => ({
          mode: 'pinned',
          pinned,
          current: null,
          paused: false,
          channels: sanitizeMusic({ channels: [...s.channels, pinned] }).channels,
        }));
      },
      setCurrent: (current) =>
        set((s) => {
          if (s.current === current) return s;
          markPlaybackTransition();
          return { current };
        }),
      setVolume: (volume) => {
        if (Number.isFinite(volume))
          set({ volume: Math.round(Math.max(0, Math.min(1, volume)) * 100) / 100 });
      },
      setMuted: (muted) => set({ muted }),
      setMixWithStreams: (mixWithStreams) => {
        markPlaybackTransition();
        set({ mixWithStreams });
      },
      setPaused: (paused) => set({ paused }),
    }),
    {
      name: 'music',
      version: 1,
      storage: zustandStorage(),
      partialize: (s): MusicPreferences => sanitizeMusic(s),
      merge: (persisted, current) => ({ ...current, ...sanitizeMusic(persisted) }),
    },
  ),
);
