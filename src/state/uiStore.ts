import { create } from 'zustand';
import type { PlayerStatus } from '@/lib/player/types';

export type DialogName = 'settings' | 'shortcuts' | 'savePreset' | 'setup' | null;

/** Transient UI state (never persisted). */
interface UiStore {
  dialog: DialogName;
  presetsMenuOpen: boolean;
  fullscreen: boolean;
  /** Bumped to ask the "add channel" box to take focus. */
  addBoxFocusRequest: number;
  playerStatus: Record<string, PlayerStatus>;
  /** Desktop app hidden in the tray: streams are stopped, alerts keep running. */
  backgrounded: boolean;
  setBackgrounded(v: boolean): void;
  /** The stream whose controls the top bar shows (the last one hovered). */
  selected: string | null;
  setSelected(login: string | null): void;
  /** Bumped to reload a stream's player. */
  reloadRequests: Record<string, number>;
  reloadPlayer(login: string): void;
  /** Briefly shows a volume readout on a stream (bumped on every change). */
  volumeFlash: { login: string; n: number } | null;
  flashVolume(login: string): void;
  openDialog(d: DialogName): void;
  setPresetsMenuOpen(open: boolean): void;
  setFullscreen(v: boolean): void;
  requestAddBoxFocus(): void;
  setPlayerStatus(login: string, status: PlayerStatus | null): void;
}

export const useUi = create<UiStore>()((set) => ({
  dialog: null,
  presetsMenuOpen: false,
  fullscreen: false,
  addBoxFocusRequest: 0,
  playerStatus: {},
  backgrounded: false,
  setBackgrounded: (backgrounded) => set({ backgrounded }),
  volumeFlash: null,
  selected: null,
  setSelected: (selected) => set((s) => (s.selected === selected ? s : { selected })),
  reloadRequests: {},
  reloadPlayer: (login) =>
    set((s) => ({
      reloadRequests: { ...s.reloadRequests, [login]: (s.reloadRequests[login] ?? 0) + 1 },
    })),
  flashVolume: (login) => set((s) => ({ volumeFlash: { login, n: (s.volumeFlash?.n ?? 0) + 1 } })),
  openDialog: (dialog) => set({ dialog, presetsMenuOpen: false }),
  setPresetsMenuOpen: (presetsMenuOpen) => set({ presetsMenuOpen }),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  requestAddBoxFocus: () => set((s) => ({ addBoxFocusRequest: s.addBoxFocusRequest + 1 })),
  setPlayerStatus: (login, status) =>
    set((s) => {
      const next = { ...s.playerStatus };
      if (status) next[login] = status;
      else delete next[login];
      return { playerStatus: next };
    }),
}));
