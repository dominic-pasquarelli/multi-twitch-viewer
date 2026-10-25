import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';
import * as ops from '@/lib/view/operations';
import * as groups from '@/lib/view/groups';
import { sanitizeView } from '@/lib/view/validate';
import type { AudioMode, ViewState } from '@/lib/view/types';
import type { LayoutMode, MainScale } from '@/lib/layout';
import { useSettings } from './settingsStore';
import { useMusicStore } from './musicStore';
import { activeMusicChannel, withMusic } from '@/lib/music/music';

const HISTORY_LIMIT = 20;

/** An earlier view, for undo, and whether it was the Favorites home view. */
export interface HistoryEntry {
  view: ViewState;
  home: boolean;
}

interface ViewStore {
  view: ViewState;
  /** Earlier views, for undo. */
  history: HistoryEntry[];
  /** What was audible before "mute all", so M can bring it back. */
  mutedFrom: string[] | null;
  /**
   * Kept view (loaded from a preset): offline streams stay. Otherwise the view
   * is temporary and streams that go offline are removed.
   */
  pinned: boolean;
  /**
   * The Favorites home view (see lib/view/favoritesHome): live favorites join
   * and leave on their own. Loading a preset, a link or Clear all leaves it.
   */
  home: boolean;

  addChannels(logins: string[]): void;
  /** Favorites that just went live joining the home view (not an undo step). */
  addHomeChannels(logins: string[]): void;
  /** Replaces the view with these live favorites and makes it the home view. */
  enterHome(logins: string[]): void;
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
  setFocusedChannels(logins: string[]): void;
  toggleFocusedChannel(login: string): void;
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
      // Explicitly arranging, focusing or opening chat makes an extra DJ part of
      // the watched view. Automatic playback alone never changes that view.
      const watchMusic = (view: ViewState, logins: (string | null | undefined)[]) => {
        const channel = activeMusicChannel(useMusicStore.getState());
        if (!channel || !logins.includes(channel) || view.channels.includes(channel)) return view;
        const next = ops.addChannels(view, [channel]);
        return view.activeGroup ? groups.assignGroup(next, channel, view.activeGroup) : next;
      };
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
          history: undoable
            ? [...get().history, { view: before, home: get().home }].slice(-HISTORY_LIMIT)
            : get().history,
          mutedFrom: after.audio.active.length
            ? null
            : get().mutedFrom &&
                after.layout.mode === 'multi-focus' &&
                after.layout.focused?.join(',') !== before.layout.focused?.join(',')
              ? ops.focusedChannels(after)
              : get().mutedFrom,
          // An empty view starts over as a temporary one.
          pinned: after.channels.length ? get().pinned : false,
        });
      };

      return {
        view: ops.emptyView(),
        history: [],
        mutedFrom: null,
        pinned: false,
        home: false,

        addChannels: (logins) =>
          apply((v) => {
            let next = ops.addChannels(v, logins);
            if (v.activeGroup)
              for (const login of logins) {
                next = groups.assignGroup(next, login, v.activeGroup);
              }
            return next;
          }, true),
        addHomeChannels: (logins) => {
          if (get().home) apply((v) => ops.addChannels(v, logins));
        },
        enterHome: (logins) => {
          apply((v) => ({ ...ops.watchOnly(v, logins), groups: [], activeGroup: null }), true);
          set({ home: true, pinned: false });
        },
        removeChannel: (login) => {
          if (activeMusicChannel(useMusicStore.getState()) === login)
            useMusicStore.getState().setMode('off');
          apply((v) => ops.removeChannel(v, login), true);
        },
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
        watchOnly: (logins) => {
          apply((v) => ({ ...ops.watchOnly(v, logins), groups: [], activeGroup: null }), true);
          set({ home: false });
        },
        replaceChannel: (t, r) => {
          if (
            !get().view.channels.includes(t) &&
            activeMusicChannel(useMusicStore.getState()) === t
          ) {
            useMusicStore.getState().pin(r);
            return;
          }
          apply((v) => {
            const next = ops.replaceChannel(v, t, r);
            return v.channels.includes(r)
              ? groups.swapGroupChannels(next, t, r)
              : groups.replaceGroupChannel(next, t, r);
          }, true);
        },
        swapChannels: (a, b) =>
          apply(
            (v) => groups.swapGroupChannels(ops.swapChannels(watchMusic(v, [a, b]), a, b), a, b),
            true,
          ),
        clear: () => {
          useMusicStore.getState().setMode('off');
          apply((v) => ({ ...ops.watchOnly(v, []), groups: [], activeGroup: null }), true);
          set({ home: false });
        },
        loadView: (view) => {
          apply(() => ops.normalize(structuredClone(view)), true);
          // A preset keeps its streams.
          set({ pinned: get().view.channels.length > 0, home: false });
        },
        undo: () => {
          const history = get().history;
          const previous = history[history.length - 1];
          if (!previous) return false;
          set({ view: previous.view, home: previous.home, history: history.slice(0, -1) });
          return true;
        },

        setLayoutMode: (mode) =>
          apply((v) => {
            const next = ops.setLayoutMode(v, mode);
            if (mode === 'multi-focus') {
              const visible = groups.displayedChannels(v);
              const focused = ops.focusedChannels(next, visible);
              return ops.setFocusedChannels(
                v,
                [...new Set([...focused, ...visible])].slice(0, Math.max(2, focused.length)),
              );
            }
            const main = ops.mainChannel(next, groups.displayedChannels(next));
            return mode === 'focus' &&
              main &&
              ops.hasSingleFocus(next.audio.mode) &&
              useSettings.getState().audioFollowsMain
              ? ops.focusAudio(next, main)
              : next;
          }),
        setFocusedChannels: (logins) => apply((v) => ops.setFocusedChannels(v, logins)),
        toggleFocusedChannel: (login) =>
          apply((v) => ops.toggleFocusedChannel(watchMusic(v, [login]), login)),
        setMain: (login) =>
          apply((v) => {
            const next = ops.setMain(watchMusic(v, [login]), login);
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

        toggleAudio: (login) => {
          const music = useMusicStore.getState();
          if (activeMusicChannel(music) === login) {
            music.setMuted(!music.muted);
            return;
          }
          if (music.mode !== 'off' && music.channels.includes(login)) {
            music.pin(login);
            music.setMuted(false);
            return;
          }
          if (music.mode !== 'off' && !music.mixWithStreams) {
            music.setMixWithStreams(true);
            apply((v) => ops.focusAudio(v, login));
          } else apply((v) => ops.toggleAudio(v, login));
        },
        focusAudio: (login) => {
          const music = useMusicStore.getState();
          if (
            music.mode !== 'off' &&
            (activeMusicChannel(music) === login || music.channels.includes(login))
          ) {
            if (activeMusicChannel(music) !== login) music.pin(login);
            music.setMuted(false);
            music.setMixWithStreams(false);
            return;
          }
          if (music.mode !== 'off') music.setMixWithStreams(true);
          apply((v) => ops.focusAudio(v, login));
        },
        toggleMuteAll: () => {
          const { view, mutedFrom } = get();
          const music = useMusicStore.getState();
          if (
            withMusic(view, music).audio.active.length ||
            (music.mode !== 'off' && !music.muted)
          ) {
            music.setMuted(true);
            set({ view: ops.muteAll(view), mutedFrom: view.audio.active });
            return;
          }
          music.setMuted(false);
          const restore = (mutedFrom ?? []).filter((c) => view.channels.includes(c));
          const fallback = ops.mainChannel(view, groups.displayedChannels(view));
          const active = restore.length
            ? restore
            : view.layout.mode === 'multi-focus'
              ? ops.focusedChannels(view, groups.displayedChannels(view))
              : fallback
                ? [fallback]
                : [];
          set({
            view: ops.normalize({ ...view, audio: { ...view.audio, active } }),
            mutedFrom: null,
          });
        },
        setAudioMode: (mode) => apply((v) => ops.setAudioMode(v, mode)),
        externalMuteChange: (login, muted) => {
          const music = useMusicStore.getState();
          if (activeMusicChannel(music) === login) {
            music.setMuted(muted);
            return;
          }
          if (!muted && music.mode !== 'off') {
            if (music.channels.includes(login)) {
              music.pin(login);
              music.setMuted(false);
              return;
            }
            music.setMixWithStreams(true);
          }
          apply((v) => ops.externalMuteChange(v, login, muted));
        },

        setChat: (chat) => apply((v) => ops.setChat(watchMusic(v, [chat.channel]), chat)),
      };
    },
    {
      name: 'session',
      version: 1,
      storage: zustandStorage(),
      partialize: (s) => ({ view: s.view, pinned: s.pinned, home: s.home }),
      merge: (persisted, current) => {
        const p = persisted as { view?: unknown; pinned?: unknown; home?: unknown } | undefined;
        const view = sanitizeView(p?.view);
        return view
          ? { ...current, view, pinned: p?.pinned === true, home: p?.home === true }
          : current;
      },
    },
  ),
);
