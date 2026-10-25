import { create } from 'zustand';
import type { PlayerStatus } from '@/lib/player/types';

export type DialogName =
  | 'settings'
  | 'shortcuts'
  | 'savePreset'
  | 'setup'
  | 'favorites'
  | 'kick'
  | 'music'
  | 'tools'
  | 'streamAudio'
  | null;

/** Transient UI state (never persisted). */
interface UiStore {
  recoveryNotice: string | null;
  dialog: DialogName;
  presetsMenuOpen: boolean;
  fullscreen: boolean;
  /** Fullscreen: the sidebar is kept open beside the streams (B), not just peeking. */
  fullscreenSidebar: boolean;
  setFullscreenSidebar(v: boolean): void;
  /** Bumped to ask the "add channel" box to take focus. */
  addBoxFocusRequest: number;
  playerStatus: Record<string, PlayerStatus>;
  /** Desktop app hidden in the tray: streams are stopped, alerts keep running. */
  backgrounded: boolean;
  setBackgrounded(v: boolean): void;
  /** Enables tile dragging without intercepting the Twitch player's controls. */
  arranging: boolean;
  setArranging(v: boolean): void;
  /** The big stream in focus layout, as shown (null in grid). */
  mainStream: string | null;
  /** Current visible player channels, after group isolation and offline hiding. */
  visibleChannels: string[] | null;
  setVisibleChannels(channels: string[]): void;
  setMainStream(login: string | null): void;
  /** The last hovered stream (keyboard shortcuts use it). */
  selected: string | null;
  setSelected(login: string | null): void;
  /** Bumped to reload a stream's player. */
  reloadRequests: Record<string, number>;
  reloadPlayer(login: string): void;
  /** Briefly shows a volume readout on a stream (bumped on every change). */
  volumeFlash: { login: string; n: number } | null;
  flashVolume(login: string): void;
  openDialog(d: DialogName): void;
  /** The Twitch channel to fill in when the Kick links dialog opens. */
  kickLinkFor: string | null;
  openKickLinks(login?: string): void;
  setPresetsMenuOpen(open: boolean): void;
  setFullscreen(v: boolean): void;
  requestAddBoxFocus(): void;
  setPlayerStatus(login: string, status: PlayerStatus | null): void;
}

export const useUi = create<UiStore>()((set) => ({
  recoveryNotice: null,
  dialog: null,
  presetsMenuOpen: false,
  fullscreen: false,
  fullscreenSidebar: false,
  setFullscreenSidebar: (fullscreenSidebar) => set({ fullscreenSidebar }),
  addBoxFocusRequest: 0,
  playerStatus: {},
  backgrounded: false,
  setBackgrounded: (backgrounded) => set({ backgrounded }),
  arranging: false,
  setArranging: (arranging) => set({ arranging }),
  volumeFlash: null,
  mainStream: null,
  visibleChannels: null,
  setVisibleChannels: (visibleChannels) =>
    set((s) =>
      s.visibleChannels?.join(',') === visibleChannels.join(',') ? s : { visibleChannels },
    ),
  setMainStream: (mainStream) => set((s) => (s.mainStream === mainStream ? s : { mainStream })),
  selected: null,
  setSelected: (selected) => set((s) => (s.selected === selected ? s : { selected })),
  reloadRequests: {},
  reloadPlayer: (login) =>
    set((s) => ({
      reloadRequests: { ...s.reloadRequests, [login]: (s.reloadRequests[login] ?? 0) + 1 },
    })),
  flashVolume: (login) => set((s) => ({ volumeFlash: { login, n: (s.volumeFlash?.n ?? 0) + 1 } })),
  openDialog: (dialog) => set({ dialog, presetsMenuOpen: false }),
  kickLinkFor: null,
  openKickLinks: (login) =>
    set({ dialog: 'kick', presetsMenuOpen: false, kickLinkFor: login ?? null }),
  setPresetsMenuOpen: (presetsMenuOpen) => set({ presetsMenuOpen }),
  // Each fullscreen starts with the sidebar tucked away.
  setFullscreen: (fullscreen) => set({ fullscreen, fullscreenSidebar: false }),
  requestAddBoxFocus: () => set((s) => ({ addBoxFocusRequest: s.addBoxFocusRequest + 1 })),
  setPlayerStatus: (login, status) =>
    set((s) => {
      const next = { ...s.playerStatus };
      if (status) next[login] = status;
      else delete next[login];
      return { playerStatus: next };
    }),
}));
