import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useUi } from '@/state/uiStore';
import { playerRegistry } from './playerRegistry';

export const VOLUME_STEP = 0.05;

/** A channel's volume: remembered value, else what its player reports, else 50%. */
export function currentVolume(login: string): number {
  return (
    useChannelPrefs.getState().volumes[login] ??
    playerRegistry.get(login)?.adapter.getVolume() ??
    0.5
  );
}

/** Raises/lowers a channel's volume by `delta` and flashes the readout on its tile. */
export function nudgeVolume(login: string, delta: number): void {
  const next = Math.min(1, Math.max(0, Math.round((currentVolume(login) + delta) * 100) / 100));
  useChannelPrefs.getState().setVolume(login, next);
  useUi.getState().flashVolume(login);
  useUi.getState().setSelected(login); // show it in the top-bar controls
}
