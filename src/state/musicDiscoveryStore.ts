import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { musicCategory, sanitizeObservations, type MusicObservations } from '@/lib/music/discovery';
import { zustandStorage } from '@/lib/persistence/zustandStorage';
import type { ChannelInformation } from '@/lib/twitch/types';

interface MusicDiscoveryStore {
  userId: string | null;
  seen: MusicObservations;
  observe(userId: string, channels: ChannelInformation[]): void;
}

/** Small local memory, isolated to the last signed-in account. Not a full category history. */
export const useMusicDiscovery = create<MusicDiscoveryStore>()(
  persist(
    (set) => ({
      userId: null,
      seen: {},
      observe: (userId, channels) =>
        set((state) => {
          const seen = state.userId === userId ? { ...state.seen } : {};
          let changed = state.userId !== userId;
          for (const channel of channels) {
            const category = musicCategory(channel.gameName);
            if (category && seen[channel.id] !== category) {
              seen[channel.id] = category;
              changed = true;
            }
          }
          return changed ? { userId, seen: sanitizeObservations(seen) } : state;
        }),
    }),
    {
      name: 'music-discovery',
      version: 1,
      storage: zustandStorage(),
      partialize: ({ userId, seen }) => ({ userId, seen }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<MusicDiscoveryStore> | null;
        return {
          ...current,
          userId: typeof saved?.userId === 'string' ? saved.userId : null,
          seen: sanitizeObservations(saved?.seen),
        };
      },
    },
  ),
);
