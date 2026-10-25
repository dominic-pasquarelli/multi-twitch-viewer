import { markPlaybackTransition } from '@/lib/player/transitions';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MIX, sanitizeMix, type MixPreferences } from '@/lib/audio/mixPreferences';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

interface MixStore extends MixPreferences {
  update(patch: Partial<MixPreferences>): void;
}

export const useMixStore = create<MixStore>()(
  persist(
    (set) => ({
      ...DEFAULT_MIX,
      update: (patch) => {
        markPlaybackTransition();
        set((s) => sanitizeMix({ ...s, ...patch }));
      },
    }),
    {
      name: 'mix',
      version: 1,
      storage: zustandStorage(),
      partialize: (s) => sanitizeMix(s),
      merge: (saved, current) => ({ ...current, ...sanitizeMix(saved) }),
    },
  ),
);
