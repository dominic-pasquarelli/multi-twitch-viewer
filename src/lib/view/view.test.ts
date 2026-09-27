import { describe, expect, it } from 'vitest';
import {
  addChannels,
  audioLevel,
  emptyView,
  externalMuteChange,
  focusAudio,
  hashToView,
  moveChannel,
  removeChannel,
  replaceChannel,
  sanitizeView,
  setAudioMode,
  setMain,
  slotOrder,
  swapChannels,
  toggleAudio,
  toggleChannel,
  viewToHash,
  watchOnly,
} from './index';

const withChannels = (...c: string[]) => addChannels(emptyView(), c);

describe('view operations', () => {
  it('adding the first streams makes the first one audible and its chat active', () => {
    const v = withChannels('a', 'b');
    expect(v.channels).toEqual(['a', 'b']);
    expect(v.audio.active).toEqual(['a']);
    expect(v.chat.channel).toBe('a');
  });

  it('adding more streams does not steal audio or duplicate', () => {
    const v = addChannels(withChannels('a'), ['b', 'a']);
    expect(v.channels).toEqual(['a', 'b']);
    expect(v.audio.active).toEqual(['a']);
  });

  it('removing the audible stream leaves silence, not a random stream', () => {
    const v = removeChannel(withChannels('a', 'b'), 'a');
    expect(v.audio.active).toEqual([]);
    expect(v.chat.channel).toBe('b');
  });

  it('toggles channels', () => {
    const v = toggleChannel(withChannels('a'), 'b');
    expect(v.channels).toEqual(['a', 'b']);
    expect(toggleChannel(v, 'a').channels).toEqual(['b']);
  });

  it('watchOnly replaces everything', () => {
    const v = watchOnly(withChannels('a', 'b'), ['c']);
    expect(v.channels).toEqual(['c']);
    expect(v.audio.active).toEqual(['c']);
  });

  it('solo audio: only one stream at a time', () => {
    let v = withChannels('a', 'b', 'c');
    v = toggleAudio(v, 'b');
    expect(v.audio.active).toEqual(['b']);
    v = toggleAudio(v, 'b');
    expect(v.audio.active).toEqual([]);
  });

  it('mix audio: several streams', () => {
    let v = setAudioMode(withChannels('a', 'b', 'c'), 'mix');
    v = toggleAudio(v, 'c');
    expect(v.audio.active).toEqual(['a', 'c']);
    v = focusAudio(v, 'b');
    expect(v.audio.active).toEqual(['b']);
    v = setAudioMode(toggleAudio(v, 'a'), 'solo');
    expect(v.audio.active).toEqual(['b']);
  });

  it('duck mode: one stream loud, the others quiet; mute-all silences everything', () => {
    let v = setAudioMode(withChannels('a', 'b', 'c'), 'duck');
    expect(audioLevel(v, 'a', 0.2)).toEqual({ muted: false, scale: 1, focused: true });
    expect(audioLevel(v, 'b', 0.2)).toEqual({ muted: false, scale: 0.2, focused: false });
    v = toggleAudio(v, 'b');
    expect(v.audio.active).toEqual(['b']);
    expect(audioLevel(v, 'a', 0.2).scale).toBe(0.2);
    v = toggleAudio(v, 'b'); // nothing focused = silence
    expect(audioLevel(v, 'a', 0.2).muted).toBe(true);
    expect(audioLevel(focusAudio(v, 'a'), 'b', 0).muted).toBe(true);
    expect(sanitizeView({ channels: ['a'], audio: { mode: 'duck' } })?.audio.mode).toBe('duck');
  });

  it('solo mode mutes everything that is not focused', () => {
    const v = withChannels('a', 'b');
    expect(audioLevel(v, 'b', 0.2).muted).toBe(true);
  });

  it('unmuting inside a player mutes the others in solo mode', () => {
    let v = withChannels('a', 'b');
    v = externalMuteChange(v, 'b', false);
    expect(v.audio.active).toEqual(['b']);
    v = externalMuteChange(v, 'b', true);
    expect(v.audio.active).toEqual([]);
  });

  it('swaps, moves and replaces while keeping slot state', () => {
    let v = setMain(withChannels('a', 'b', 'c'), 'a');
    v = swapChannels(v, 'a', 'c');
    expect(v.channels).toEqual(['c', 'b', 'a']);
    expect(v.layout.main).toBe('c');
    v = moveChannel(v, 'a', 0);
    expect(v.channels).toEqual(['a', 'c', 'b']);
    v = replaceChannel(focusAudio(v, 'c'), 'c', 'z');
    expect(v.channels).toEqual(['a', 'z', 'b']);
    expect(v.audio.active).toEqual(['z']);
    expect(v.layout.main).toBe('z');
  });

  it('slotOrder puts the main stream first in focus mode', () => {
    const v = setMain(withChannels('a', 'b', 'c'), 'b');
    expect(slotOrder(v)).toEqual(['b', 'a', 'c']);
    expect(slotOrder(v, ['a', 'c'])).toEqual(['a', 'c']);
    expect(slotOrder({ ...v, layout: { ...v.layout, mode: 'grid' } })).toEqual(['a', 'b', 'c']);
  });
});

describe('sanitizeView', () => {
  it('fills defaults and drops junk', () => {
    const v = sanitizeView({
      channels: ['A', 'bad name', 'b', 'a', 7],
      layout: { mode: 'focus', main: 'x', mainScale: 5 },
      audio: { mode: 'mix', active: ['b', 'zzz'] },
      chat: { open: true },
    });
    expect(v).toEqual({
      channels: ['a', 'b'],
      layout: { mode: 'focus', main: null, mainScale: 'auto' },
      audio: { mode: 'mix', active: ['b'] },
      chat: { open: true, channel: 'a' },
    });
  });
  it('rejects non-views', () => {
    expect(sanitizeView(null)).toBeNull();
    expect(sanitizeView({ layout: {} })).toBeNull();
  });
});

describe('url hash', () => {
  it('round-trips', () => {
    const v = setMain(withChannels('a', 'b'), 'b');
    expect(viewToHash(v)).toBe('#/a/b?layout=focus&main=b');
    expect(hashToView('#/a/b?layout=focus&main=b')).toEqual({
      channels: ['a', 'b'],
      mode: 'focus',
      main: 'b',
    });
  });
  it('handles grid links, bad names and non-view hashes', () => {
    expect(hashToView('#/Xqc/bad-name/xqc')).toEqual({
      channels: ['xqc'],
      mode: 'grid',
      main: null,
    });
    expect(hashToView('#access_token=abc')).toBeNull();
    expect(viewToHash(emptyView())).toBe('');
  });
});
