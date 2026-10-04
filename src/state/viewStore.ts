import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';
import * as ops from '@/lib/view/operations';
import * as groups from '@/lib/view/groups';
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
  /**
   * Kept view (loaded from a preset): offline streams stay. Otherwise the view
   * is temporary and streams that go offline are removed.
   */
  pinned: boolean;

  addChannels(logins: string[]): void;
  removeChannel(login: string): void;
  removeChannels(logins: string[]): void;
  setPinned(pinned: boolean): void;
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
  createGroup(name: string): string;
  renameGroup(id: string, name: string): void;
  removeGroup(id: string): void;
  assignGroup(login: string, id: string | null): void;
  setActiveGroup(id: string | null): void;

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
        let after = groups.normalizeGroups(fn(before));
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
          // An empty view starts over as a temporary one.
          pinned: after.channels.length ? get().pinned : false,
        });
      };

      return {
        view: ops.emptyView(),
        history: [],
        mutedFrom: null,
        pinned: false,

        addChannels: (logins) =>
          apply((v) => {
            let next = ops.addChannels(v, logins);
            if (v.activeGroup)
              for (const login of logins) {
                next = groups.assignGroup(next, login, v.activeGroup);
              }
            return next;
          }, true),
        removeChannel: (login) => apply((v) => ops.removeChannel(v, login), true),
        removeChannels: (logins) =>
          apply((v) => logins.reduce((acc, l) => ops.removeChannel(acc, l), v), true),
        setPinned: (pinned) => set({ pinned }),
        toggleChannel: (login) =>
          apply((v) => {
            const next = ops.toggleChannel(v, login);
            return !v.channels.includes(login) && v.activeGroup
              ? groups.assignGroup(next, login, v.activeGroup)
              : next;
          }, true),
        watchOnly: (logins) =>
          apply((v) => ({ ...ops.watchOnly(v, logins), groups: [], activeGroup: null }), true),
        replaceChannel: (t, r) =>
          apply((v) => {
            const next = ops.replaceChannel(v, t, r);
            return v.channels.includes(r)
              ? groups.swapGroupChannels(next, t, r)
              : groups.replaceGroupChannel(next, t, r);
          }, true),
        swapChannels: (a, b) =>
          apply((v) => groups.swapGroupChannels(ops.swapChannels(v, a, b), a, b), true),
        clear: () =>
          apply((v) => ({ ...ops.watchOnly(v, []), groups: [], activeGroup: null }), true),
        loadView: (view) => {
          apply(() => ops.normalize(structuredClone(view)), true);
          set({ pinned: get().view.channels.length > 0 }); // a preset keeps its streams
        },
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
            const main = ops.mainChannel(next, groups.displayedChannels(next));
            return mode === 'focus' &&
              main &&
              ops.hasSingleFocus(next.audio.mode) &&
              useSettings.getState().audioFollowsMain
              ? ops.focusAudio(next, main)
              : next;
          }),
        setMain: (login) =>
          apply((v) => {
            const next = ops.setMain(v, login);
            return ops.hasSingleFocus(next.audio.mode) && useSettings.getState().audioFollowsMain
              ? ops.focusAudio(next, login)
              : next;
          }),
        setMainScale: (scale) => apply((v) => ops.setMainScale(v, scale)),
        createGroup: (name) => {
          const id = crypto.randomUUID();
          apply((v) => groups.createGroup(v, name, id), true);
          return id;
        },
        renameGroup: (id, name) => apply((v) => groups.renameGroup(v, id, name), true),
        removeGroup: (id) => apply((v) => groups.removeGroup(v, id), true),
        assignGroup: (login, id) => apply((v) => groups.assignGroup(v, login, id), true),
        setActiveGroup: (id) => apply((v) => ({ ...v, activeGroup: id })),

        toggleAudio: (login) => apply((v) => ops.toggleAudio(v, login)),
        focusAudio: (login) => apply((v) => ops.focusAudio(v, login)),
        toggleMuteAll: () => {
          const { view, mutedFrom } = get();
          if (view.audio.active.length) {
            set({ view: ops.muteAll(view), mutedFrom: view.audio.active });
            return;
          }
          const restore = (mutedFrom ?? []).filter((c) => view.channels.includes(c));
          const fallback = ops.mainChannel(view, groups.displayedChannels(view));
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
      partialize: (s) => ({ view: s.view, pinned: s.pinned }),
      merge: (persisted, current) => {
        const p = persisted as { view?: unknown; pinned?: unknown } | undefined;
        const view = sanitizeView(p?.view);
        return view ? { ...current, view, pinned: p?.pinned === true } : current;
      },
    },
  ),
);
