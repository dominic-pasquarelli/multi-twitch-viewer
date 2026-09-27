import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';
import * as ops from '@/lib/view/operations';
import { sanitizeView } from '@/lib/view/validate';
import type { AudioMode, ViewState } from '@/lib/view/types';
import type { LayoutMode, MainScale } from '@/lib/layout';
import { useSettings } from './settingsStore';

const HISTORY_LIMIT = 20;

interface ViewStore {
  view: ViewState;
  /** Earlier views, for undo. */
  history: ViewState[];
  /** What was audible before "mute all", so M can bring it back. */
  mutedFrom: string[] | null;

  addChannels(logins: string[]): void;
  removeChannel(login: string): void;
  toggleChannel(login: string): void;
  watchOnly(logins: string[]): void;
  replaceChannel(target: string, replacement: string): void;
  swapChannels(a: string, b: string): void;
  clear(): void;
  loadView(view: ViewState): void;
  undo(): boolean;

  setLayoutMode(mode: LayoutMode): void;
  setMain(login: string): void;
  setMainScale(scale: MainScale): void;

  toggleAudio(login: string): void;
  focusAudio(login: string): void;
  toggleMuteAll(): void;
  setAudioMode(mode: AudioMode): void;
  externalMuteChange(login: string, muted: boolean): void;

  setChat(chat: Partial<ViewState['chat']>): void;
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set, get) => {
      /** Applies a change; `undoable` changes are recorded for undo. */
      const apply = (fn: (v: ViewState) => ViewState, undoable = false) => {
        const before = get().view;
        let after = fn(before);
        if (after === before) return;
        const settings = useSettings.getState();
        // Chat follows the stream you're listening to.
        const heard = after.audio.active[after.audio.active.length - 1];
        if (settings.chatFollowsAudio && heard && heard !== before.audio.active.at(-1)) {
          after = ops.setChat(after, { channel: heard });
        }
        set({
          view: after,
          history: undoable ? [...get().history, before].slice(-HISTORY_LIMIT) : get().history,
          mutedFrom: after.audio.active.length ? null : get().mutedFrom,
        });
      };

      return {
        view: ops.emptyView(),
        history: [],
        mutedFrom: null,

        addChannels: (logins) => apply((v) => ops.addChannels(v, logins), true),
        removeChannel: (login) => apply((v) => ops.removeChannel(v, login), true),
        toggleChannel: (login) => apply((v) => ops.toggleChannel(v, login), true),
        watchOnly: (logins) => apply((v) => ops.watchOnly(v, logins), true),
        replaceChannel: (t, r) => apply((v) => ops.replaceChannel(v, t, r), true),
        swapChannels: (a, b) => apply((v) => ops.swapChannels(v, a, b), true),
        clear: () => apply((v) => ops.watchOnly(v, []), true),
        loadView: (view) => apply(() => ops.normalize(structuredClone(view)), true),
        undo: () => {
          const history = get().history;
          const previous = history[history.length - 1];
          if (!previous) return false;
          set({ view: previous, history: history.slice(0, -1) });
          return true;
        },

        setLayoutMode: (mode) =>
          apply((v) => {
            const next = ops.setLayoutMode(v, mode);
            const main = ops.mainChannel(next);
            return mode === 'focus' && main && useSettings.getState().audioFollowsMain
              ? ops.focusAudio(next, main)
              : next;
          }),
        setMain: (login) =>
          apply((v) => {
            const next = ops.setMain(v, login);
            return useSettings.getState().audioFollowsMain ? ops.focusAudio(next, login) : next;
          }),
        setMainScale: (scale) => apply((v) => ops.setMainScale(v, scale)),

        toggleAudio: (login) => apply((v) => ops.toggleAudio(v, login)),
        focusAudio: (login) => apply((v) => ops.focusAudio(v, login)),
        toggleMuteAll: () => {
          const { view, mutedFrom } = get();
          if (view.audio.active.length) {
            set({ view: ops.muteAll(view), mutedFrom: view.audio.active });
            return;
          }
          const restore = (mutedFrom ?? []).filter((c) => view.channels.includes(c));
          const fallback = ops.mainChannel(view);
          const active = restore.length ? restore : fallback ? [fallback] : [];
          set({
            view: ops.normalize({ ...view, audio: { ...view.audio, active } }),
            mutedFrom: null,
          });
        },
        setAudioMode: (mode) => apply((v) => ops.setAudioMode(v, mode)),
        externalMuteChange: (login, muted) => apply((v) => ops.externalMuteChange(v, login, muted)),

        setChat: (chat) => apply((v) => ops.setChat(v, chat)),
      };
    },
    {
      name: 'session',
      version: 1,
      storage: zustandStorage(),
      partialize: (s) => ({ view: s.view }),
      merge: (persisted, current) => {
        const view = sanitizeView((persisted as { view?: unknown } | undefined)?.view);
        return view ? { ...current, view } : current;
      },
    },
  ),
);
