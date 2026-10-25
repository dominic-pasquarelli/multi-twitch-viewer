import { beforeEach, describe, expect, it } from 'vitest';
import { sanitizeMusic, DEFAULT_MUSIC, chooseMusicChannel } from '@/lib/music/music';
import { DEFAULT_MIX } from '@/lib/audio/mixPreferences';
import { streamVolume } from '@/lib/audio/volumeModel';
import { emptyView, addChannels } from '@/lib/view/operations';
import { sanitizeScene, sanitizeSettings } from '@/lib/preferences/configuration';
import { createPreset, exportPresets, parsePresetsFile } from '@/lib/presets/presets';
import { useMusicStore } from '@/state/musicStore';
import { useMixStore } from '@/state/mixStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { DEFAULT_SETTINGS, useSettings } from '@/state/settingsStore';
import { useViewStore } from '@/state/viewStore';
import { usePresets } from '@/state/presetsStore';
import { sleepGain } from '@/state/sleepTimerStore';
import { withTemporaryListen, temporaryScale } from '@/state/playbackEffectsStore';
import { captureScene, loadPreset } from '../presets/scenes';
import { captureBackup, parseBackup, restoreBackup } from './backup';

beforeEach(() => {
  useMusicStore.setState({ ...DEFAULT_MUSIC, skipped: [], current: null, paused: false });
  useMixStore.setState(DEFAULT_MIX);
  useSettings.setState(DEFAULT_SETTINGS);
  useViewStore.setState({
    view: addChannels(emptyView(), ['a', 'b']),
    history: [],
    mutedFrom: null,
  });
  usePresets.setState({ presets: [] });
  useChannelPrefs.setState({
    volumes: {},
    balance: {},
    master: 0.5,
    mainLevel: 1,
    output: 1,
    favorites: [],
  });
});

describe('DJ preferences', () => {
  it('keeps an eligible current DJ, but skips or replaces it when requested/offline', () => {
    const live = new Set(['a', 'b']);
    expect(chooseMusicChannel(['a', 'b'], live, true, 'b', { keepCurrent: true })).toBe('b');
    expect(
      chooseMusicChannel(['a', 'b'], live, true, 'b', { keepCurrent: true, skipped: ['b'] }),
    ).toBe('a');
    expect(chooseMusicChannel(['a', 'b'], new Set(['a']), true, 'b', { keepCurrent: true })).toBe(
      'a',
    );
    expect(chooseMusicChannel(['a', 'b'], live, false, 'b', { skipped: ['b'] })).toBeNull();
  });
  it('sanitizes DJ trims/fades and applies a trim under the independent DJ level', () => {
    const prefs = sanitizeMusic({ trims: { a: 0.5, b: Infinity, invalid: -1 }, fadeSeconds: 99 });
    expect(prefs.trims).toEqual({ a: 0.5 });
    expect(prefs.fadeSeconds).toBe(5);
    expect(
      streamVolume(
        {
          consistent: false,
          master: 1,
          volumes: {},
          balance: {},
          musicChannel: 'a',
          musicVolume: 0.4,
          musicTrim: 0.5,
        },
        'a',
      ),
    ).toBe(0.2);
  });
});

describe('complete scenes and backups', () => {
  it('loads and undoes full scene settings and round-trips them through preset export', () => {
    useMusicStore.getState().pin('dj');
    useMusicStore.getState().setTrim('dj', 0.7);
    useMixStore.getState().update({ immersive: true, priorityLevel: 0.63 });
    useChannelPrefs.getState().setOutput(0.43);
    const scene = captureScene();
    const preset = { ...createPreset('Scene', useViewStore.getState().view), scene };
    expect(parsePresetsFile(exportPresets([preset])).presets[0]!.scene).toEqual(scene);
    useMusicStore.getState().setMode('off');
    useChannelPrefs.getState().setOutput(0.8);
    loadPreset(preset);
    expect(useMusicStore.getState().mode).toBe('pinned');
    expect(useChannelPrefs.getState().output).toBe(0.43);
    expect(useViewStore.getState().undo()).toBe(true);
    expect(useMusicStore.getState().mode).toBe('off');
    expect(useChannelPrefs.getState().output).toBe(0.8);
  });
  it('exports complete portable preferences, preserves device credentials on restore and ignores injected fields', () => {
    useSettings
      .getState()
      .update({ clientId: 'device-client', kickClientSecret: 'private-secret', tileGap: 9 });
    useMusicStore.getState().pin('dj');
    useChannelPrefs.getState().addFavorites(['a']);
    const backup = captureBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toContain('private-secret');
    expect(text).not.toContain('device-client');
    useMusicStore.getState().setMode('off');
    useSettings.getState().update({ tileGap: 1 });
    restoreBackup(parseBackup(text));
    expect(useSettings.getState().tileGap).toBe(9);
    expect(useSettings.getState().kickClientSecret).toBe('private-secret');
    expect(useMusicStore.getState().pinned).toBe('dj');
    expect(useChannelPrefs.getState().favorites).toEqual(['a']);
    expect(
      sanitizeSettings({ clientId: 'injected', update: 'replace action', tileGap: 99 }),
    ).not.toHaveProperty('clientId');
    expect(typeof useSettings.getState().update).toBe('function');
  });
  it('rejects malformed backups before changing any state', () => {
    const before = captureScene();
    expect(() => parseBackup('bad json')).toThrow('not valid JSON');
    expect(() => parseBackup('{"format":"multi-twitch-viewer/backup","version":2}')).toThrow(
      'Unsupported',
    );
    expect(() =>
      restoreBackup({
        ...captureBackup(),
        data: { ...captureBackup().data, presets: [{}] },
      } as never),
    ).toThrow('invalid presets');
    expect(captureScene()).toEqual(before);
    expect(
      sanitizeScene({ audio: { output: Infinity }, music: { fadeSeconds: NaN } }).audio.output,
    ).toBe(1);
  });
});

it('temporary listening can hear a suppressed target without mutating saved selections or levels', () => {
  const view = {
    ...addChannels(emptyView(), ['a', 'b']),
    audio: { mode: 'mix' as const, active: ['a'], suppressed: ['b'] },
  };
  expect(withTemporaryListen(view, 'b').audio).toEqual({
    mode: 'mix',
    active: ['a', 'b'],
    suppressed: [],
  });
  expect(view.audio.active).toEqual(['a']);
  expect(temporaryScale('a', 'a', { listen: 'b', sleepGain: 0.5, musicGain: 0.5 })).toBe(0.03);
  expect(withTemporaryListen(view, null)).toBe(view);
});

it('sleep fading uses wall-clock time, reaches zero and leaves full volume before the fade window', () => {
  expect(sleepGain(60_000, 10, 0)).toBe(1);
  expect(sleepGain(60_000, 10, 55_000)).toBe(0.5);
  expect(sleepGain(60_000, 10, 60_000)).toBe(0);
  expect(sleepGain(60_000, 0, 59_999)).toBe(1);
});

it('mute-all cancels a preview without unmuting an already-muted saved mix', async () => {
  const { usePlaybackEffects } = await import('@/state/playbackEffectsStore');
  useViewStore.getState().toggleMuteAll();
  expect(useViewStore.getState().view.audio.active).toEqual([]);
  usePlaybackEffects.setState({ listen: 'b' });
  useViewStore.getState().toggleMuteAll();
  expect(usePlaybackEffects.getState().listen).toBeNull();
  expect(useViewStore.getState().view.audio.active).toEqual([]);
});
