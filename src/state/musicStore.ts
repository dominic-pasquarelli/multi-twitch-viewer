import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeLogin } from '@/lib/channels/parseChannels';
import {
  DEFAULT_MUSIC,
  sanitizeMusic,
  type MusicPlayback,
  type MusicPreferences,
} from '@/lib/music/music';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

interface MusicStore extends MusicPlayback {
  paused: boolean;
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
      setMode: (mode) =>
        set((s) =>
          s.mode === mode ? s : { mode, current: mode === 'auto' ? s.pinned : null, paused: false },
        ),
      pin: (raw) => {
        const pinned = normalizeLogin(raw);
        if (!pinned) return;
        set((s) => ({
          mode: 'pinned',
          pinned,
          current: null,
          paused: false,
          channels: sanitizeMusic({ channels: [...s.channels, pinned] }).channels,
        }));
      },
      setCurrent: (current) => set((s) => (s.current === current ? s : { current })),
      setVolume: (volume) => {
        if (Number.isFinite(volume))
          set({ volume: Math.round(Math.max(0, Math.min(1, volume)) * 100) / 100 });
      },
      setMuted: (muted) => set({ muted }),
      setMixWithStreams: (mixWithStreams) => set({ mixWithStreams }),
      setPaused: (paused) => set({ paused }),
    }),
    {
      name: 'music',
      version: 1,
      storage: zustandStorage(),
      partialize: (s): MusicPreferences => ({
        channels: s.channels,
        mode: s.mode,
        pinned: s.pinned,
        volume: s.volume,
        mixWithStreams: s.mixWithStreams,
        muted: s.muted,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeMusic(persisted) }),
    },
  ),
);
