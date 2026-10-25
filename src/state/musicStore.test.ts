import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC, activeMusicChannel, withMusic } from '@/lib/music/music';
import { audioLevel, emptyView } from '@/lib/view/operations';
import {
  balanceFocusedAudio,
  currentVolume,
  nudgeHeard,
  setMaster,
  setStreamMix,
} from '@/features/viewer/volume';
import { useMusicStore } from './musicStore';
import { useViewStore } from './viewStore';
import { useChannelPrefs } from './channelPrefsStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';

const music = () => useMusicStore.getState();
const view = () => useViewStore.getState();
const playback = () => withMusic(view().view, music());

beforeEach(() => {
  useMusicStore.setState({ ...DEFAULT_MUSIC, current: null, paused: false });
  useViewStore.setState({
    view: emptyView(),
    history: [],
    mutedFrom: null,
    home: false,
    pinned: false,
  });
  useSettings.setState({ ...DEFAULT_SETTINGS });
  useChannelPrefs.setState({ master: 0.5, balance: {}, volumes: {} });
});

describe('music preferences and view controls', () => {
  it('explicitly arranging or opening chat keeps an extra DJ as a watched stream in the active group', () => {
    view().addChannels(['a', 'b']);
    const group = view().createGroup('Watching');
    view().assignGroup('a', group);
    view().assignGroup('b', group);
    view().setActiveGroup(group);
    music().pin('dj');
    view().swapChannels('a', 'dj');
    expect(view().view.channels).toEqual(['dj', 'b', 'a']);
    expect(view().view.groups![0]!.channels).toContain('dj');
    music().pin('dj2');
    view().setChat({ channel: 'dj2', open: true });
    expect(view().view.chat.channel).toBe('dj2');
    expect(view().view.groups![0]!.channels).toContain('dj2');
  });

  it('preserves an ordered, unique list; pinning overrides automatic and removing a pin stops music', () => {
    music().addChannels(['DJ1', 'dj2', 'dj1']);
    music().moveChannel('dj2', -1);
    expect(music().channels).toEqual(['dj2', 'dj1']);
    music().setMode('auto');
    music().setCurrent('dj2');
    music().setMode('auto'); // Selecting the current mode must not drop the player.
    expect(activeMusicChannel(music())).toBe('dj2');
    music().pin('DJ3');
    expect(music().channels).toEqual(['dj2', 'dj1', 'dj3']);
    expect(activeMusicChannel(music())).toBe('dj3');
    music().removeChannel('dj3');
    expect(music().mode).toBe('off');
  });

  it('persists preferences but never the last live selection or Pause all hold', async () => {
    music().addChannels(['dj1', 'dj2']);
    music().setMode('auto');
    music().setCurrent('dj2');
    music().setPaused(true);
    music().setVolume(0.26);
    const saved = await useMusicStore.persist.getOptions().storage!.getItem('music');
    expect(saved?.state).toMatchObject({ channels: ['dj1', 'dj2'], mode: 'auto', volume: 0.26 });
    expect(saved?.state).not.toHaveProperty('current');
    expect(saved?.state).not.toHaveProperty('paused');
  });

  it('keeps music through focus/preset changes and lets the speaker enable mixed audio', () => {
    view().addChannels(['a', 'b', 'c']);
    music().pin('dj');
    view().setLayoutMode('multi-focus');
    view().toggleFocusedChannel('c');
    expect(playback().audio.active).toEqual(['dj']);
    view().toggleAudio('b');
    expect(music().mixWithStreams).toBe(true);
    expect(playback().audio.active).toEqual(['b', 'dj']);
    view().loadView({ ...emptyView(), channels: ['other'] });
    expect(playback().channels).toEqual(['other', 'dj']);
    expect(view().view.channels).toEqual(['other']);
  });

  it('Mute all survives automatic DJ switches and restores the video mix and new DJ', () => {
    view().addChannels(['a', 'b']);
    view().setLayoutMode('multi-focus');
    music().addChannels(['dj1', 'dj2']);
    music().setMode('auto');
    music().setCurrent('dj1');
    music().setMixWithStreams(true);
    view().toggleMuteAll();
    music().setCurrent('dj2');
    expect(playback().audio.active).toEqual([]);
    for (const login of playback().channels)
      expect(audioLevel(playback(), login, 0.2).muted).toBe(true);
    view().toggleMuteAll();
    expect(playback().audio.active).toEqual(['a', 'b', 'dj2']);
  });

  it('music speaker and player mute controls affect music only; clear and closing a DJ stop music', () => {
    view().addChannels(['a']);
    music().pin('dj');
    view().toggleAudio('dj');
    expect(music().muted).toBe(true);
    expect(view().view.audio.active).toEqual(['a']);
    view().externalMuteChange('dj', false);
    expect(music().muted).toBe(false);
    view().removeChannel('dj');
    expect(music().mode).toBe('off');
    music().pin('dj');
    view().clear();
    expect(playback().channels).toEqual([]);
    expect(music().mode).toBe('off');
  });
});

describe('music volume', () => {
  it('stays independent of consistent volume, main priority and equalizing multi focus', () => {
    view().addChannels(['a', 'dj']);
    view().setLayoutMode('multi-focus');
    useSettings.setState({ consistentVolume: true, mainPriority: true });
    const chatBeforeMusic = view().view.chat.channel;
    music().pin('dj');
    setStreamMix('dj', 0.23);
    setMaster(0.8);
    balanceFocusedAudio();
    expect(currentVolume('dj')).toBe(0.23);
    expect(currentVolume('a')).toBe(0.4);
    expect(useChannelPrefs.getState().balance).not.toHaveProperty('dj');
    nudgeHeard(['dj'], 0.05);
    expect(currentVolume('dj')).toBe(0.28);
    expect(useChannelPrefs.getState().master).toBe(0.8);
    expect(view().view.chat.channel).toBe(chatBeforeMusic);
  });
});
