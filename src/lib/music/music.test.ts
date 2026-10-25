import { describe, expect, it } from 'vitest';
import { displayedChannels } from '../view/groups';
import { addChannels, audioLevel, emptyView, setLayoutMode } from '../view/operations';
import {
  activeMusicChannel,
  chooseMusicChannel,
  DEFAULT_MUSIC,
  sanitizeMusic,
  withMusic,
  type MusicPlayback,
} from './music';

const music = (patch: Partial<MusicPlayback> = {}): MusicPlayback => ({
  ...DEFAULT_MUSIC,
  channels: ['dj1', 'dj2'],
  mode: 'auto',
  current: 'dj2',
  ...patch,
});

describe('music selection', () => {
  it('chooses the first live DJ, preempts a lower priority and falls back on confirmed offline status', () => {
    expect(chooseMusicChannel(['dj1', 'dj2'], new Set(['dj2']), true, null)).toBe('dj2');
    expect(chooseMusicChannel(['dj1', 'dj2'], new Set(['dj1', 'dj2']), true, 'dj2')).toBe('dj1');
    expect(chooseMusicChannel(['dj1', 'dj2'], new Set(['dj2']), true, 'dj1')).toBe('dj2');
    expect(chooseMusicChannel(['dj1', 'dj2'], new Set(), true, 'dj2')).toBeNull();
    expect(chooseMusicChannel(['dj2', 'dj1'], new Set(['dj1', 'dj2']), true, 'dj1')).toBe('dj2');
  });

  it('retains the current DJ during errors and placeholder results, unless removed from the list', () => {
    expect(chooseMusicChannel(['dj1', 'dj2'], new Set(['dj1']), false, 'dj2')).toBe('dj2');
    expect(chooseMusicChannel(['dj1'], new Set(['dj1']), false, 'dj2')).toBeNull();
    expect(chooseMusicChannel(['dj1'], new Set(['dj1']), false, null)).toBeNull();
  });

  it('sanitizes persisted input and keeps explicit pins independent of automatic selection', () => {
    expect(
      sanitizeMusic({ channels: [' DJ1 ', 'dj1', 2, '', 'dj2'], mode: 'pinned', volume: NaN }),
    ).toEqual({ ...DEFAULT_MUSIC, channels: ['dj1', 'dj2'] });
    expect(
      sanitizeMusic({ channels: Array.from({ length: 60 }, (_, i) => `dj${i}`), volume: 2 })
        .channels,
    ).toHaveLength(50);
    expect(sanitizeMusic({ volume: 2 }).volume).toBe(1);
    expect(activeMusicChannel(music({ mode: 'pinned', pinned: 'dj1' }))).toBe('dj1');
    expect(activeMusicChannel(music({ mode: 'off' }))).toBeNull();
  });
});

describe('music playback projection', () => {
  it('adds one visible DJ without changing the saved view, and preserves watched DJs when stopped', () => {
    const view = addChannels(emptyView(), ['video', 'dj1']);
    const snapshot = structuredClone(view);
    const playback = withMusic(view, music());
    expect(playback.channels).toEqual(['video', 'dj1', 'dj2']);
    expect(playback.audio.active).toEqual(['dj2']);
    expect(audioLevel(playback, 'video', 0.2).muted).toBe(true);
    expect(withMusic(view, music({ current: 'dj1' })).channels).toEqual(['video', 'dj1']);
    expect(withMusic(view, music({ mode: 'off' }))).toBe(view);
    expect(view).toEqual(snapshot);
  });

  it('keeps inactive DJs silent even in Duck mode and mixes the selected DJ with video audio', () => {
    const view = addChannels(emptyView(), ['video', 'dj1']);
    view.audio.mode = 'duck';
    const playback = withMusic(view, music({ mixWithStreams: true }));
    expect(playback.audio.active).toEqual(['video', 'dj2']);
    expect(audioLevel(playback, 'video', 0.2)).toMatchObject({ muted: false, scale: 1 });
    expect(audioLevel(playback, 'dj1', 0.2).muted).toBe(true);
    expect(audioLevel(playback, 'dj2', 0.2)).toMatchObject({ muted: false, scale: 1 });
    expect(
      audioLevel(withMusic(view, music({ mixWithStreams: true, muted: true })), 'dj2', 0.2).muted,
    ).toBe(true);
  });

  it('keeps music visible in isolated groups without changing their membership or multi focus', () => {
    const view = setLayoutMode(addChannels(emptyView(), ['a', 'b', 'c']), 'multi-focus');
    view.groups = [{ id: 'group', name: 'Pair', channels: ['a', 'b'] }];
    view.activeGroup = 'group';
    const playback = withMusic(view, music());
    expect(displayedChannels(playback)).toEqual(['a', 'b', 'dj2']);
    expect(playback.layout).toEqual(view.layout);
    expect(view.groups[0]!.channels).toEqual(['a', 'b']);
  });
});
