import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

/**
 * Per-channel preferences that outlive any one layout: volume is remembered
 * per streamer (some are much louder than others), and favorites are starred
 * channels that sort first and can trigger go-live alerts.
 */
interface ChannelPrefsStore {
  volumes: Record<string, number>;
  favorites: string[];
  setVolume(login: string, volume: number): void;
  toggleFavorite(login: string): void;
}

export const useChannelPrefs = create<ChannelPrefsStore>()(
  persist(
    (set) => ({
      volumes: {},
      favorites: [],
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
          volumes: p.volumes && typeof p.volumes === 'object' ? p.volumes : {},
          favorites: Array.isArray(p.favorites)
            ? p.favorites.filter((f): f is string => typeof f === 'string')
            : [],
        };
      },
    },
  ),
);
