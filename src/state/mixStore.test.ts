import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIX } from '@/lib/audio/mixPreferences';
import { DEFAULT_MUSIC } from '@/lib/music/music';
import { emptyView } from '@/lib/view/operations';
import {
  balanceFocusedAudio,
  currentVolume,
  nudgeHeard,
  setImmersiveMix,
  setStreamMix,
  setStreamVolume,
  toggleMixPriority,
} from '@/features/viewer/volume';
import { useChannelPrefs } from './channelPrefsStore';
import { useMixStore } from './mixStore';
import { useMusicStore } from './musicStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { useUi } from './uiStore';
import { useViewStore } from './viewStore';

const view = () => useViewStore.getState();
const mix = () => useMixStore.getState();
beforeEach(() => {
  useViewStore.setState({
    view: emptyView(),
    history: [],
    mutedFrom: null,
    pinned: false,
    home: false,
  });
  useSettings.setState(DEFAULT_SETTINGS);
  useMixStore.setState(DEFAULT_MIX);
  useMusicStore.setState({ ...DEFAULT_MUSIC, current: null, paused: false });
  useChannelPrefs.setState({
    volumes: { a: 0.25, b: 0.4, c: 0.3 },
    balance: {},
    master: 0.5,
    mainLevel: 1,
    output: 1,
  });
  useUi.setState({ mainStream: null, visibleChannels: null });
  view().addChannels(['a', 'b', 'c', 'd']);
});

describe('mix controls', () => {
  it('enables immersive Mix without changing what is audible; turning it off preserves Mix', () => {
    setImmersiveMix(true);
    expect(view().view.audio.mode).toBe('mix');
    expect(view().view.audio.active).toEqual(['a']);
    setImmersiveMix(false);
    expect(view().view.audio.mode).toBe('mix');
    expect(mix().immersive).toBe(false);
  });

  it('links priority levels while preserving manual settings, mute and DJ level', () => {
    view().setLayoutMode('multi-focus');
    useMusicStore.getState().pin('dj');
    mix().update({ enabled: true, backgroundEnabled: true });
    view().toggleMuteAll();
    setStreamMix('a', 0.6);
    setStreamVolume('c', 0.15);
    setStreamMix('dj', 0.27);
    expect(currentVolume('b')).toBe(0.6);
    expect(currentVolume('d')).toBe(0.15);
    expect(currentVolume('dj')).toBe(0.27);
    expect(view().view.audio.active).toEqual([]);
    expect(useMusicStore.getState().muted).toBe(true);
    mix().update({ enabled: false });
    expect(currentVolume('a')).toBe(0.25);
    expect(currentVolume('b')).toBe(0.4);
    expect(currentVolume('c')).toBe(0.3);
  });

  it('raises a shared role only once when multiple streams are heard, including consistent mode', () => {
    view().setLayoutMode('multi-focus');
    useMusicStore.getState().pin('dj');
    useSettings.setState({ consistentVolume: true });
    mix().update({ enabled: true, backgroundEnabled: true });
    nudgeHeard(['a', 'b', 'a', 'c', 'd', 'dj'], 0.05);
    expect(mix().priorityLevel).toBe(0.75);
    expect(mix().backgroundLevel).toBe(0.25);
    expect(useMusicStore.getState().volume).toBe(0.4);
    expect(useChannelPrefs.getState().master).toBe(0.5);
    mix().update({ backgroundEnabled: false });
    nudgeHeard(['a', 'b', 'c', 'd'], 0.05);
    expect(mix().priorityLevel).toBe(0.8);
    expect(useChannelPrefs.getState().master).toBe(0.55);
  });

  it('sets up to three manual priorities without changing layout or unmuting', () => {
    view().setAudioMode('mix');
    view().toggleMuteAll();
    toggleMixPriority('b');
    toggleMixPriority('c');
    toggleMixPriority('d');
    toggleMixPriority('a');
    expect(mix().priorities).toEqual(['b', 'c', 'd']);
    expect(view().view.layout.mode).toBe('grid');
    expect(view().view.audio.active).toEqual([]);
    view().removeChannel('c');
    toggleMixPriority('a');
    expect(mix().priorities).toEqual(['b', 'd', 'a']);
  });

  it('equalizes fixed focus levels, excludes the DJ, and suspends fixed levels outside Mix', () => {
    view().setLayoutMode('multi-focus');
    mix().update({ enabled: true });
    useSettings.setState({ consistentVolume: true });
    balanceFocusedAudio();
    expect(mix().priorityLevel).toBe(0.5);
    view().setAudioMode('solo');
    setStreamMix('a', 0.2);
    expect(mix().priorityLevel).toBe(0.5);
    expect(currentVolume('a')).toBe(0.2);
    view().setAudioMode('mix');
    expect(currentVolume('a')).toBe(0.5);
  });

  it('persists the mix and rejects invalid volume values from controls', async () => {
    mix().update({
      immersive: true,
      enabled: true,
      priorityLevel: 0.63,
      prioritySource: 'manual',
      priorities: ['a', 'b'],
    });
    view().setAudioMode('mix');
    setStreamMix('a', NaN);
    setStreamVolume('b', Infinity);
    expect(mix().priorityLevel).toBe(0.63);
    const saved = await useMixStore.persist.getOptions().storage!.getItem('mix');
    expect(saved?.state).toMatchObject({
      immersive: true,
      enabled: true,
      priorityLevel: 0.63,
      priorities: ['a', 'b'],
    });
    expect(saved?.state).not.toHaveProperty('update');
  });
});
