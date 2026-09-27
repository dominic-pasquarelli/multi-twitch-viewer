import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

/**
 * Per-channel preferences that outlive any one layout. Volume is remembered
 * per streamer, because some are much louder than others.
 */
interface ChannelPrefsStore {
  volumes: Record<string, number>;
  setVolume(login: string, volume: number): void;
}

export const useChannelPrefs = create<ChannelPrefsStore>()(
  persist(
    (set) => ({
      volumes: {},
      setVolume: (login, volume) =>
        set((s) => ({
          volumes: {
            ...s.volumes,
            [login]: Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100,
          },
        })),
    }),
    { name: 'channel-prefs', version: 1, storage: zustandStorage() },
  ),
);
