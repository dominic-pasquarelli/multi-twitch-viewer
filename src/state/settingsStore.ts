import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LiveAlertMode } from '@/lib/alerts/goLive';
import { isQualityChoice, type QualityChoice } from '@/lib/player/quality';
import { zustandStorage } from '@/lib/persistence/zustandStorage';

export type SidebarSort = 'viewers' | 'name' | 'uptime';

export interface Settings {
  /** Overrides VITE_TWITCH_CLIENT_ID when set. */
  clientId: string;
  tileGap: number;
  /** Collapse tiles of channels that are offline; they come back when live. */
  hideOffline: boolean;
  /** Temporary views (not loaded from a preset) drop streams that go offline. */
  dropOfflineStreams: boolean;
  /** Sidebar: show the history of channels watched without following them. */
  showHistory: boolean;
  /** In focus mode, the main stream is the one you hear. */
  audioFollowsMain: boolean;
  /** The chat panel switches to whichever stream you are listening to. */
  chatFollowsAudio: boolean;
  /** Quality of the main stream (focus layout) or the one you're hearing (grid). */
  mainQuality: QualityChoice;
  /** Quality of all the other streams; lower saves bandwidth and CPU. */
  otherQuality: QualityChoice;
  refreshSeconds: number;
  sidebarSort: SidebarSort;
  sidebarCollapsed: boolean;
  showOfflineFollows: boolean;
  /** Pop up a notification when favorites (or anyone you follow) go live. */
  liveAlerts: LiveAlertMode;
  /** Every stream you listen to plays at one master volume (see lib/audio/volumeModel). */
  consistentVolume: boolean;
  /** Duck audio mode: how loud the background streams play (0–1 of their volume). */
  duckLevel: number;
  /** Focus layout: clicking a small stream makes it the main one. */
  clickToFocus: boolean;
  /** Right-clicking a small stream (not the main one in focus layout) closes it. */
  rightClickCloses: boolean;
  /** Desktop app: hide Twitch's channel/title/Subscribe overlay at the top of each player. */
  hideStreamInfo: boolean;
  /** Desktop app: click through Twitch's "intended for certain audiences" notice. */
  skipContentWarning: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  clientId: '',
  tileGap: 4,
  hideOffline: true,
  dropOfflineStreams: true,
  showHistory: true,
  audioFollowsMain: true,
  chatFollowsAudio: true,
  mainQuality: 'source',
  otherQuality: 'fit',
  refreshSeconds: 60,
  sidebarSort: 'viewers',
  sidebarCollapsed: false,
  showOfflineFollows: true,
  liveAlerts: 'favorites',
  consistentVolume: false,
  duckLevel: 0.2,
  clickToFocus: true,
  rightClickCloses: true,
  hideStreamInfo: true,
  skipContentWarning: true,
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
      merge: (persisted, current) => {
        const p = { ...(persisted as Partial<Settings> & { qualityMode?: unknown }) };
        delete p.qualityMode; // replaced by mainQuality/otherQuality
        if (!isQualityChoice(p.mainQuality)) delete p.mainQuality;
        if (!isQualityChoice(p.otherQuality)) delete p.otherQuality;
        return { ...current, ...p };
      },
    },
  ),
);
