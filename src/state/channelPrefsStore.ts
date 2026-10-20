import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VolumePatch } from '@/lib/audio/volumeModel';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

/**
 * Per-channel preferences that outlive any one layout: volume is remembered
 * per streamer (some are much louder than others), and favorites are starred
 * channels that sort first and can trigger go-live alerts.
 */
interface ChannelPrefsStore {
  volumes: Record<string, number>;
  /** Consistent-volume mode: the one volume you hear (see lib/audio/volumeModel). */
  master: number;
  /** Consistent-volume mode: each channel's level against the master (1 = same). */
  balance: Record<string, number>;
  favorites: string[];
  /** The app's output level (0–1): scales everything it plays, after the mix. */
  output: number;
  setVolume(login: string, volume: number): void;
  setOutput(volume: number): void;
  applyVolume(patch: VolumePatch): void;
  toggleFavorite(login: string): void;
}

export const useChannelPrefs = create<ChannelPrefsStore>()(
  persist(
    (set) => ({
      volumes: {},
      master: 0.5,
      balance: {},
      favorites: [],
      output: 1,
      applyVolume: (patch) => set(patch),
      setOutput: (volume) =>
        set({ output: Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100 }),
      toggleFavorite: (login) =>
        set((s) => ({
          favorites: s.favorites.includes(login)
            ? s.favorites.filter((f) => f !== login)
            : [...s.favorites, login],
        })),
      setVolume: (login, volume) =>
        set((s) => ({
          volumes: {
            ...s.volumes,
            [login]: Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100,
          },
        })),
    }),
    {
      name: 'channel-prefs',
      version: 1,
      storage: zustandStorage(),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChannelPrefsStore>;
        return {
          ...current,
          volumes: numberRecord(p.volumes),
          balance: numberRecord(p.balance),
          master: typeof p.master === 'number' && p.master >= 0 && p.master <= 1 ? p.master : 0.5,
          output: typeof p.output === 'number' && p.output >= 0 && p.output <= 1 ? p.output : 1,
          favorites: Array.isArray(p.favorites)
            ? p.favorites.filter((f): f is string => typeof f === 'string')
            : [],
        };
      },
    },
  ),
);

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0),
  );
}
