import { MIN_MAIN_SCALE } from '../layout';
import { EMPTY_VIEW, MAX_CHANNELS, type AudioMode, type ViewState } from './types';

/**
 * Pure state transitions for the view. The zustand store calls these, and
 * they are unit tested on their own.
 */

export function addChannels(view: ViewState, logins: string[]): ViewState {
  const fresh = logins.filter((l) => !view.channels.includes(l));
  if (!fresh.length) return view;
  const channels = [...view.channels, ...fresh].slice(0, MAX_CHANNELS);
  const wasEmpty = view.channels.length === 0;
  return normalize({
    ...view,
    channels,
    // Starting from nothing, the first stream you add is the one you hear.
    audio: wasEmpty ? { ...view.audio, active: [channels[0]!] } : view.audio,
    chat: view.chat.channel ? view.chat : { ...view.chat, channel: channels[0]! },
  });
}

export function removeChannel(view: ViewState, login: string): ViewState {
  if (!view.channels.includes(login)) return view;
  return normalize({ ...view, channels: view.channels.filter((c) => c !== login) });
}

export function toggleChannel(view: ViewState, login: string): ViewState {
  return view.channels.includes(login) ? removeChannel(view, login) : addChannels(view, [login]);
}

/** Replaces the whole view with just these channels. */
export function watchOnly(view: ViewState, logins: string[]): ViewState {
  return addChannels(
    {
      ...view,
      channels: [],
      audio: { ...view.audio, active: [] },
      chat: { ...view.chat, channel: null },
    },
    logins,
  );
}

/** Puts `replacement` in the slot of `target`, keeping audio/main/chat on that slot. */
export function replaceChannel(view: ViewState, target: string, replacement: string): ViewState {
  if (!view.channels.includes(target) || target === replacement) return view;
  if (view.channels.includes(replacement)) return swapChannels(view, target, replacement);
  const swap = (c: string) => (c === target ? replacement : c);
  return normalize({
    ...view,
    channels: view.channels.map(swap),
    layout: { ...view.layout, main: view.layout.main && swap(view.layout.main) },
    audio: { ...view.audio, active: view.audio.active.map(swap) },
    chat: { ...view.chat, channel: view.chat.channel && swap(view.chat.channel) },
  });
}

export function swapChannels(view: ViewState, a: string, b: string): ViewState {
  const i = view.channels.indexOf(a);
  const j = view.channels.indexOf(b);
  if (i < 0 || j < 0 || i === j) return view;
  const channels = [...view.channels];
  channels[i] = b;
  channels[j] = a;
  // In focus mode the main tile is a slot: swapping with it changes the main.
  const main = view.layout.main === a ? b : view.layout.main === b ? a : view.layout.main;
  return { ...view, channels, layout: { ...view.layout, main } };
}

/** Moves a channel to a new index in the display order. */
export function moveChannel(view: ViewState, login: string, toIndex: number): ViewState {
  const from = view.channels.indexOf(login);
  if (from < 0) return view;
  const channels = view.channels.filter((c) => c !== login);
  channels.splice(Math.max(0, Math.min(toIndex, channels.length)), 0, login);
  return { ...view, channels };
}

export function setLayoutMode(view: ViewState, mode: ViewState['layout']['mode']): ViewState {
  return { ...view, layout: { ...view.layout, mode } };
}

export function setMain(view: ViewState, login: string): ViewState {
  if (!view.channels.includes(login)) return view;
  return { ...view, layout: { ...view.layout, main: login, mode: 'focus' } };
}

export function setMainScale(view: ViewState, scale: ViewState['layout']['mainScale']): ViewState {
  const mainScale = scale === 'auto' ? 'auto' : Math.min(1, Math.max(MIN_MAIN_SCALE, scale));
  return { ...view, layout: { ...view.layout, mainScale } };
}

/** Hear only this stream. */
export function focusAudio(view: ViewState, login: string): ViewState {
  if (!view.channels.includes(login)) return view;
  return { ...view, audio: { ...view.audio, active: [login] } };
}

/** Solo mode: switch to it (or mute it). Mix mode: add/remove it from the mix. */
export function toggleAudio(view: ViewState, login: string): ViewState {
  if (!view.channels.includes(login)) return view;
  const isActive = view.audio.active.includes(login);
  let active: string[];
  if (hasSingleFocus(view.audio.mode)) active = isActive ? [] : [login];
  else
    active = isActive
      ? view.audio.active.filter((c) => c !== login)
      : [...view.audio.active, login];
  return { ...view, audio: { ...view.audio, active } };
}

export function muteAll(view: ViewState): ViewState {
  return { ...view, audio: { ...view.audio, active: [] } };
}

export function setAudioMode(view: ViewState, mode: AudioMode): ViewState {
  const active = hasSingleFocus(mode) ? view.audio.active.slice(0, 1) : view.audio.active;
  return { ...view, audio: { mode, active } };
}

/**
 * The user (un)muted a stream using the Twitch player's own button. In solo
 * mode unmuting one stream mutes the rest, so audio never piles up.
 */
export function externalMuteChange(view: ViewState, login: string, muted: boolean): ViewState {
  if (!view.channels.includes(login)) return view;
  if (muted)
    return {
      ...view,
      audio: { ...view.audio, active: view.audio.active.filter((c) => c !== login) },
    };
  if (view.audio.active.includes(login)) return view;
  return hasSingleFocus(view.audio.mode) ? focusAudio(view, login) : toggleAudio(view, login);
}

export function setChat(view: ViewState, chat: Partial<ViewState['chat']>): ViewState {
  return normalize({ ...view, chat: { ...view.chat, ...chat } });
}

/** Channel order used for layout slots: in focus mode the main stream goes first. */
export function slotOrder(view: ViewState, visible: string[] = view.channels): string[] {
  const main = mainChannel(view, visible);
  if (view.layout.mode !== 'focus' || !main) return visible;
  return [main, ...visible.filter((c) => c !== main)];
}

export function mainChannel(view: ViewState, visible: string[] = view.channels): string | null {
  if (view.layout.main && visible.includes(view.layout.main)) return view.layout.main;
  return visible[0] ?? null;
}

/** Drops references to channels that are no longer in the view. */
export function normalize(view: ViewState): ViewState {
  const has = (c: string | null): c is string => !!c && view.channels.includes(c);
  let active = view.audio.active.filter(has);
  if (hasSingleFocus(view.audio.mode)) active = active.slice(0, 1);
  return {
    ...view,
    layout: { ...view.layout, main: has(view.layout.main) ? view.layout.main : null },
    audio: { ...view.audio, active },
    chat: {
      ...view.chat,
      channel: has(view.chat.channel) ? view.chat.channel : (view.channels[0] ?? null),
    },
  };
}

/** Solo and duck both have exactly one "focused" stream. */
export const hasSingleFocus = (mode: AudioMode): boolean => mode !== 'mix';

export interface AudioLevel {
  muted: boolean;
  /** Multiplier applied to the channel's own volume (1 = as set). */
  scale: number;
  /** The stream you're focused on (full volume). */
  focused: boolean;
}

/**
 * How loud a stream should play. In duck mode the non-focused streams keep
 * playing at `duckLevel` of their volume; muting everything (M) silences all.
 */
export function audioLevel(view: ViewState, login: string, duckLevel: number): AudioLevel {
  const focused = view.audio.active.includes(login);
  if (focused) return { muted: false, scale: 1, focused };
  if (view.audio.mode === 'duck' && view.audio.active.length > 0 && duckLevel > 0) {
    return { muted: false, scale: duckLevel, focused };
  }
  return { muted: true, scale: 1, focused };
}

export const emptyView = (): ViewState => structuredClone(EMPTY_VIEW);
