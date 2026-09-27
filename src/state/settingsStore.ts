import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

export type QualityMode = 'auto' | 'fit';
export type SidebarSort = 'viewers' | 'name' | 'uptime';

export interface Settings {
  /** Overrides VITE_TWITCH_CLIENT_ID when set. */
  clientId: string;
  tileGap: number;
  /** Collapse tiles of channels that are offline; they come back when live. */
  hideOffline: boolean;
  /** In focus mode, the main stream is the one you hear. */
  audioFollowsMain: boolean;
  /** The chat panel switches to whichever stream you are listening to. */
  chatFollowsAudio: boolean;
  /** 'fit' picks a stream quality that matches each tile's size (saves bandwidth). */
  qualityMode: QualityMode;
  refreshSeconds: number;
  sidebarSort: SidebarSort;
  sidebarCollapsed: boolean;
  showOfflineFollows: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  clientId: '',
  tileGap: 4,
  hideOffline: true,
  audioFollowsMain: true,
  chatFollowsAudio: true,
  qualityMode: 'auto',
  refreshSeconds: 60,
  sidebarSort: 'viewers',
  sidebarCollapsed: false,
  showOfflineFollows: true,
};

interface SettingsStore extends Settings {
  update(patch: Partial<Settings>): void;
  reset(): void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'settings',
      version: 1,
      storage: zustandStorage(),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<Settings>) }),
    },
  ),
);
