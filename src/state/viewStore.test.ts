import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings, DEFAULT_SETTINGS } from './settingsStore';
import { useViewStore } from './viewStore';
import { usePresets } from './presetsStore';
import { useChannelPrefs } from './channelPrefsStore';
import { emptyView } from '@/lib/view/operations';

const store = () => useViewStore.getState();

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS });
  useViewStore.setState({ view: emptyView(), history: [], mutedFrom: null });
  usePresets.setState({ presets: [] });
  useChannelPrefs.setState({ volumes: {}, balance: {}, master: 0.5 });
});

describe('viewStore', () => {
  it('undoes a removal', () => {
    store().addChannels(['a', 'b']);
    store().removeChannel('a');
    expect(store().view.channels).toEqual(['b']);
    expect(store().undo()).toBe(true);
    expect(store().view.channels).toEqual(['a', 'b']);
  });

  it('audio follows main and chat follows audio', () => {
    store().addChannels(['a', 'b']);
    store().setMain('b');
    expect(store().view.layout.mode).toBe('focus');
    expect(store().view.audio.active).toEqual(['b']);
    expect(store().view.chat.channel).toBe('b');
  });

  it('respects settings turning those behaviours off', () => {
    useSettings.setState({ audioFollowsMain: false, chatFollowsAudio: false });
    store().addChannels(['a', 'b']);
    store().setMain('b');
    expect(store().view.audio.active).toEqual(['a']);
    store().focusAudio('b');
    expect(store().view.chat.channel).toBe('a');
  });

  it('changing the main stream in mix mode keeps the complete mix and remembered levels', () => {
    store().addChannels(['a', 'b', 'c']);
    store().setAudioMode('mix');
    store().toggleAudio('b');
    useChannelPrefs.setState({ volumes: { a: 0.2, b: 0.7, c: 0.4 }, balance: { a: 0.4, b: 1.4 } });
    const levels = useChannelPrefs.getState();
    store().setMain('c');
    expect(store().view.layout.main).toBe('c');
    expect(store().view.audio.active).toEqual(['a', 'b']);
    expect(useChannelPrefs.getState().volumes).toEqual(levels.volumes);
    expect(useChannelPrefs.getState().balance).toEqual(levels.balance);
    expect(useChannelPrefs.getState().master).toBe(levels.master);
    store().setLayoutMode('grid');
    store().setLayoutMode('focus');
    expect(store().view.audio.active).toEqual(['a', 'b']);
  });

  it('changing focus preserves mute all and restores the same mix later', () => {
    store().addChannels(['a', 'b', 'c']);
    store().setAudioMode('mix');
    store().toggleAudio('b');
    store().toggleMuteAll();
    store().setMain('c');
    expect(store().view.audio.active).toEqual([]);
    store().toggleMuteAll();
    expect(store().view.audio.active).toEqual(['a', 'b']);
  });

  it('M mutes everything and brings the same streams back', () => {
    store().addChannels(['a', 'b']);
    store().setAudioMode('mix');
    store().toggleAudio('b');
    store().toggleMuteAll();
    expect(store().view.audio.active).toEqual([]);
    store().toggleMuteAll();
    expect(store().view.audio.active).toEqual(['a', 'b']);
  });

  it('presets save a copy and overwrite by name', () => {
    store().addChannels(['a']);
    const p = usePresets.getState().save('Mine', store().view);
    store().addChannels(['b']);
    expect(p.view.channels).toEqual(['a']);
    usePresets.getState().save('Mine', store().view);
    expect(usePresets.getState().presets).toHaveLength(1);
    expect(usePresets.getState().presets[0]!.view.channels).toEqual(['a', 'b']);
  });
});
