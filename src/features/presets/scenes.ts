import type { Preset } from '@/lib/presets/presets';
import { sanitizeScene, type ScenePreferences } from '@/lib/preferences/configuration';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useMixStore } from '@/state/mixStore';
import { useMusicStore } from '@/state/musicStore';
import { useSettings } from '@/state/settingsStore';
import { useViewStore } from '@/state/viewStore';
import { usePlaybackEffects } from '@/state/playbackEffectsStore';

export const captureScene = (): ScenePreferences =>
  sanitizeScene({
    music: useMusicStore.getState(),
    mix: useMixStore.getState(),
    audio: useChannelPrefs.getState(),
    settings: useSettings.getState(),
  });

export function applyScene(scene: ScenePreferences) {
  const next = sanitizeScene(scene);
  usePlaybackEffects.setState({ listen: null, musicGain: 1 });
  useMusicStore.setState({ ...next.music, current: null, skipped: [], paused: false });
  useMixStore.getState().update(next.mix);
  useChannelPrefs.getState().applyVolume(next.audio);
  useSettings.getState().update(next.settings);
}

export function loadPreset(preset: Preset) {
  const before = preset.scene ? captureScene() : null;
  useViewStore.getState().loadView(preset.view, before ? () => applyScene(before) : undefined);
  if (preset.scene) applyScene(preset.scene);
}
