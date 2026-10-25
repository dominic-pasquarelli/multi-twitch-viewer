import {
  sanitizeAudio,
  sanitizeScene,
  sanitizeSettings,
  channels,
  record,
} from '@/lib/preferences/configuration';
import { sanitizeView } from '@/lib/view/validate';
import { sanitizePreset, type Preset } from '@/lib/presets/presets';
import { sanitizeKickLinks } from '@/lib/kick/links';
import { sanitizeHistory } from '@/lib/history/watchHistory';
import { sanitizeObservations } from '@/lib/music/discovery';
import { useViewStore } from '@/state/viewStore';
import { useSettings } from '@/state/settingsStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useMusicDiscovery } from '@/state/musicDiscoveryStore';
import { usePresets } from '@/state/presetsStore';
import { useWatchHistory } from '@/state/historyStore';
import { useSleepTimer } from '@/state/sleepTimerStore';
import { captureScene, applyScene } from '../presets/scenes';

export const BACKUP_FORMAT = 'multi-twitch-viewer/backup';

export function captureBackup() {
  const v = useViewStore.getState();
  const prefs = useChannelPrefs.getState();
  const discovery = useMusicDiscovery.getState();
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      view: v.view,
      pinned: v.pinned,
      home: v.home,
      scene: captureScene(),
      settings: sanitizeSettings(useSettings.getState()),
      channelPrefs: {
        ...sanitizeAudio(prefs),
        favorites: channels(prefs.favorites),
        kickLinks: sanitizeKickLinks(prefs.kickLinks),
      },
      discovery: { userId: discovery.userId, seen: sanitizeObservations(discovery.seen) },
      presets: usePresets
        .getState()
        .presets.map(sanitizePreset)
        .filter((p): p is Preset => !!p),
      history: sanitizeHistory(useWatchHistory.getState().entries),
    },
  };
}

export type AppBackup = ReturnType<typeof captureBackup>;

/** Validate everything before the first store is changed. Unknown fields, including credentials, are ignored. */
export function parseBackup(text: string): AppBackup {
  if (text.length > 2_000_000) throw new Error('Backup is too large (maximum 2 MB).');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = record(raw);
  if (file.format !== BACKUP_FORMAT || file.version !== 1)
    throw new Error('Unsupported backup format or version.');
  const p = record(file.data);
  const view = sanitizeView(p.view);
  if (
    !view ||
    !p.scene ||
    !p.settings ||
    !p.channelPrefs ||
    !Array.isArray(p.presets) ||
    !Array.isArray(p.history)
  )
    throw new Error('The backup is missing required settings. Nothing was changed.');
  const prefs = record(p.channelPrefs);
  const discovery = record(p.discovery);
  const presets = p.presets.map(sanitizePreset);
  if (presets.length > 500 || presets.some((p) => !p))
    throw new Error('The backup contains invalid presets. Nothing was changed.');
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    data: {
      view,
      pinned: p.pinned === true,
      home: p.home === true,
      scene: sanitizeScene(p.scene),
      settings: sanitizeSettings(p.settings),
      channelPrefs: {
        ...sanitizeAudio(prefs),
        favorites: channels(prefs.favorites),
        kickLinks: sanitizeKickLinks(prefs.kickLinks),
      },
      discovery: {
        userId: typeof discovery.userId === 'string' ? discovery.userId : null,
        seen: sanitizeObservations(discovery.seen),
      },
      presets: presets as Preset[],
      history: sanitizeHistory(p.history),
    },
  };
}

export function restoreBackup(backup: AppBackup) {
  // Revalidate caller-supplied objects as well as uploaded files.
  const p = parseBackup(JSON.stringify(backup)).data;
  useSleepTimer.getState().cancel();
  useSettings.getState().update(p.settings);
  useChannelPrefs.setState(p.channelPrefs);
  usePresets.setState({ presets: p.presets });
  useWatchHistory.setState({ entries: p.history });
  useMusicDiscovery.setState(p.discovery);
  applyScene(p.scene);
  useViewStore.getState().loadView(p.view);
  useViewStore.setState({ pinned: p.pinned, home: p.home, history: [], mutedFrom: null });
}
