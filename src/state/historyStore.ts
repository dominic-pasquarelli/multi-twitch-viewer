import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  recordWatch,
  renameEntry,
  sanitizeHistory,
  type HistoryEntry,
} from '@/lib/history/watchHistory';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

/** Channels you watched without following them (see lib/history). */
interface HistoryStore {
  entries: HistoryEntry[];
  record(login: string, displayName?: string): void;
  rename(login: string, displayName: string): void;
  forget(login: string): void;
  clear(): void;
}

export const useWatchHistory = create<HistoryStore>()(
  persist(
    (set) => ({
      entries: [],
      record: (login, displayName = login) =>
        set((s) => ({
          entries: recordWatch(s.entries, { login, displayName, lastWatched: Date.now() }),
        })),
      rename: (login, displayName) =>
        set((s) => ({ entries: renameEntry(s.entries, login, displayName) })),
      forget: (login) => set((s) => ({ entries: s.entries.filter((e) => e.login !== login) })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'watch-history',
      version: 1,
      storage: zustandStorage(),
      partialize: (s) => ({ entries: s.entries }),
      merge: (persisted, current) => ({
        ...current,
        entries: sanitizeHistory((persisted as { entries?: unknown } | undefined)?.entries),
      }),
    },
  ),
);
