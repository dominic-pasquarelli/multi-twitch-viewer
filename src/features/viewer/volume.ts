import {
  setHeardVolume,
  setMasterVolume,
  setMixVolume,
  streamVolume,
  type VolumeModel,
} from '@/lib/audio/volumeModel';
import type { ViewState } from '@/lib/view/types';
import { focusedChannels } from '@/lib/view/operations';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { playerRegistry } from './playerRegistry';

export const VOLUME_STEP = 0.05;

/** Main stream priority applies in Mix + Focus (when enabled) to the stream shown big. */
const priorityMainOf = (
  enabled: boolean,
  view: ViewState,
  mainStream: string | null,
): string | null =>
  enabled && view.audio.mode === 'mix' && view.layout.mode === 'focus' ? mainStream : null;

const model = (): VolumeModel => {
  const { volumes, master, balance, mainLevel } = useChannelPrefs.getState();
  const { consistentVolume, mainPriority } = useSettings.getState();
  const priorityMain = priorityMainOf(
    mainPriority,
    useViewStore.getState().view,
    useUi.getState().mainStream,
  );
  return { consistent: consistentVolume, volumes, master, balance, mainLevel, priorityMain };
};

/** The volume model, for components (re-renders when any part changes). */
export function useVolumeModel(): VolumeModel {
  const consistent = useSettings((s) => s.consistentVolume);
  const mainPriority = useSettings((s) => s.mainPriority);
  const volumes = useChannelPrefs((s) => s.volumes);
  const master = useChannelPrefs((s) => s.master);
  const balance = useChannelPrefs((s) => s.balance);
  const mainLevel = useChannelPrefs((s) => s.mainLevel);
  const view = useViewStore((s) => s.view);
  const mainStream = useUi((s) => s.mainStream);
  const priorityMain = priorityMainOf(mainPriority, view, mainStream);
  return { consistent, volumes, master, balance, mainLevel, priorityMain };
}

/** What a stream plays at: its set volume, else what its player reports, else 50%. */
export function currentVolume(login: string, m: VolumeModel = model()): number {
  return streamVolume(m, login) ?? playerRegistry.get(login)?.adapter.getVolume() ?? 0.5;
}

/**
 * Before a stream starts playing at the main level, keep its own level to
 * return to (per-channel mode; a channel without one plays at its player's).
 */
export function keepOwnVolume(login: string): void {
  const m = model();
  if (m.consistent || m.volumes[login] !== undefined || m.priorityMain === login) return;
  const own = playerRegistry.get(login)?.adapter.getVolume();
  if (own !== undefined) useChannelPrefs.getState().setVolume(login, own);
}

/** "Hear this stream at `volume`" (moves the master volume in consistent mode). */
export function setStreamVolume(login: string, volume: number): void {
  useChannelPrefs.getState().applyVolume(setHeardVolume(model(), login, volume));
}

/** A mixer row: this stream's level in the mix (its balance in consistent mode). */
export function setStreamMix(login: string, volume: number): void {
  useChannelPrefs.getState().applyVolume(setMixVolume(model(), login, volume));
}

/** Equal starting levels with room for two or three simultaneous streams. */
export function balanceFocusedAudio(): void {
  const view = useViewStore.getState().view;
  const channels = focusedChannels(view);
  const m = model();
  const volume = (m.consistent ? m.master : 1) / Math.max(2, channels.length);
  channels.forEach((login) => setStreamMix(login, volume));
}

export function setMaster(volume: number): void {
  useChannelPrefs.getState().applyVolume(setMasterVolume(volume));
}

const step = (v: number, delta: number) =>
  Math.min(1, Math.max(0, Math.round((v + delta) * 100) / 100));

/** Raises/lowers a channel's volume by `delta` and flashes the readout. */
export function nudgeVolume(login: string, delta: number): void {
  setStreamVolume(login, step(currentVolume(login), delta));
  useUi.getState().flashVolume(login);
  useUi.getState().setSelected(login); // show it in the top-bar controls
}

/** ↑/↓: louder or quieter for what you're hearing (once, in consistent mode). */
export function nudgeHeard(logins: string[], delta: number): void {
  if (!logins.length) return;
  if (!useSettings.getState().consistentVolume) {
    logins.forEach((login) => nudgeVolume(login, delta));
    return;
  }
  setMaster(step(useChannelPrefs.getState().master, delta));
  useUi.getState().flashVolume(logins[0]!);
}
