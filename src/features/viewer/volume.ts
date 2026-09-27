import {
  setHeardVolume,
  setMasterVolume,
  setMixVolume,
  streamVolume,
  type VolumeModel,
} from '@/lib/audio/volumeModel';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { useUi } from '@/state/uiStore';
import { playerRegistry } from './playerRegistry';

export const VOLUME_STEP = 0.05;

const model = (): VolumeModel => {
  const { volumes, master, balance } = useChannelPrefs.getState();
  return { consistent: useSettings.getState().consistentVolume, volumes, master, balance };
};

/** The volume model, for components (re-renders when any part changes). */
export function useVolumeModel(): VolumeModel {
  const consistent = useSettings((s) => s.consistentVolume);
  const volumes = useChannelPrefs((s) => s.volumes);
  const master = useChannelPrefs((s) => s.master);
  const balance = useChannelPrefs((s) => s.balance);
  return { consistent, volumes, master, balance };
}

/** What a stream plays at: its set volume, else what its player reports, else 50%. */
export function currentVolume(login: string, m: VolumeModel = model()): number {
  return streamVolume(m, login) ?? playerRegistry.get(login)?.adapter.getVolume() ?? 0.5;
}

/** "Hear this stream at `volume`" (moves the master volume in consistent mode). */
export function setStreamVolume(login: string, volume: number): void {
  useChannelPrefs.getState().applyVolume(setHeardVolume(model(), login, volume));
}

/** A mixer row: this stream's level in the mix (its balance in consistent mode). */
export function setStreamMix(login: string, volume: number): void {
  useChannelPrefs.getState().applyVolume(setMixVolume(model(), login, volume));
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
