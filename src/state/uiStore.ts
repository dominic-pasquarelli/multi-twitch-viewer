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
