import {
  fixedMixRole,
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
import { activeMusicChannel } from '@/lib/music/music';
import { useMusicStore } from '@/state/musicStore';
import { useMixStore } from '@/state/mixStore';
import { mixPriorities } from '@/lib/audio/mixPreferences';

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
  const music = useMusicStore.getState();
  const prefs = useMixStore.getState();
  const view = useViewStore.getState().view;
  const managed = prefs.enabled && view.audio.mode === 'mix';
  return {
    consistent: consistentVolume,
    volumes,
    master,
    balance,
    mainLevel,
    priorityMain: managed ? null : priorityMain,
    mix: managed
      ? {
          priorities: mixPriorities(
            view,
            prefs,
            activeMusicChannel(music),
            useUi.getState().mainStream,
            useUi.getState().visibleChannels,
          ),
          priorityLevel: prefs.priorityLevel,
          backgroundLevel: prefs.backgroundEnabled ? prefs.backgroundLevel : null,
        }
      : undefined,
    musicChannel: activeMusicChannel(music),
    musicVolume: music.volume,
    musicTrim: music.trims[activeMusicChannel(music) ?? ''] ?? 1,
  };
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
  const visibleChannels = useUi((s) => s.visibleChannels);
  const musicChannel = useMusicStore(activeMusicChannel);
  const musicVolume = useMusicStore((s) => s.volume);
  const musicTrim = useMusicStore((s) => s.trims[activeMusicChannel(s) ?? ''] ?? 1);
  const priorityMain = priorityMainOf(mainPriority, view, mainStream);
  const prefs = useMixStore();
  const managed = prefs.enabled && view.audio.mode === 'mix';
  return {
    consistent,
    volumes,
    master,
    balance,
    mainLevel,
    priorityMain: managed ? null : priorityMain,
    mix: managed
      ? {
          priorities: mixPriorities(view, prefs, musicChannel, mainStream, visibleChannels),
          priorityLevel: prefs.priorityLevel,
          backgroundLevel: prefs.backgroundEnabled ? prefs.backgroundLevel : null,
        }
      : undefined,
    musicChannel,
    musicVolume,
    musicTrim,
  };
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
  if (fixedMixRole(m, login)) return;
  if (m.consistent || m.volumes[login] !== undefined || m.priorityMain === login) return;
  const own = playerRegistry.get(login)?.adapter.getVolume();
  if (own !== undefined) useChannelPrefs.getState().setVolume(login, own);
}

/** Shared fixed levels are changed once, regardless of which surface adjusts them. */
function setFixedVolume(login: string, volume: number, m: VolumeModel): boolean {
  switch (fixedMixRole(m, login)) {
    case 'music':
      useMusicStore.getState().setVolume(volume / (m.musicTrim ?? 1));
      return true;
    case 'priority':
      useMixStore.getState().update({ priorityLevel: volume });
      return true;
    case 'background':
      useMixStore.getState().update({ backgroundLevel: volume });
      return true;
    default:
      return false;
  }
}

/** Player controls and keyboard: fixed role level, or the existing manual volume behavior. */
export function setStreamVolume(login: string, volume: number): void {
  if (!Number.isFinite(volume)) return;
  const m = model();
  if (!setFixedVolume(login, volume, m))
    useChannelPrefs.getState().applyVolume(setHeardVolume(m, login, volume));
}

/** A tile/mixer slider: fixed role level, or just this channel's manual balance. */
export function setStreamMix(login: string, volume: number): void {
  if (!Number.isFinite(volume)) return;
  const m = model();
  if (!setFixedVolume(login, volume, m))
    useChannelPrefs.getState().applyVolume(setMixVolume(m, login, volume));
}

export function setImmersiveMix(immersive: boolean): void {
  if (immersive) useViewStore.getState().setAudioMode('mix');
  useMixStore.getState().update({ immersive });
}

/** Override focus-following priorities without changing layout, listening or mute. */
export function toggleMixPriority(login: string): void {
  const view = useViewStore.getState().view;
  const music = activeMusicChannel(useMusicStore.getState());
  if (login === music || !view.channels.includes(login)) return;
  const prefs = useMixStore.getState();
  const current = prefs.enabled
    ? mixPriorities(
        view,
        prefs,
        music,
        useUi.getState().mainStream,
        useUi.getState().visibleChannels,
      )
    : [];
  if (!current.includes(login) && current.length >= 3) return;
  prefs.update({
    enabled: true,
    prioritySource: 'manual',
    priorities: current.includes(login) ? current.filter((c) => c !== login) : [...current, login],
  });
}

/** Equal starting levels with room for two or three simultaneous streams. */
export function balanceFocusedAudio(): void {
  const view = useViewStore.getState().view;
  const m = model();
  const channels = focusedChannels(view).filter((c) => c !== m.musicChannel);
  const volume = (m.consistent && !m.mix ? m.master : 1) / Math.max(2, channels.length);
  channels
    .filter((login) => login !== m.musicChannel)
    .forEach((login) => setStreamMix(login, volume));
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
  const m = model();
  const adjusted = new Set<string>();
  const manual: string[] = [];
  for (const login of new Set(logins)) {
    const role = fixedMixRole(m, login);
    if (!role) {
      manual.push(login);
      continue;
    }
    if (!adjusted.has(role)) nudgeVolume(login, delta);
    adjusted.add(role);
  }
  if (!manual.length) return;
  if (!m.consistent) manual.forEach((login) => nudgeVolume(login, delta));
  else {
    setMaster(step(m.master, delta));
    useUi.getState().flashVolume(manual[0]!);
  }
}
