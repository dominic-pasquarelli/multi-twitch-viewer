import { describe, expect, it } from 'vitest';
import {
  addChannels,
  emptyView,
  focusedChannels,
  removeChannel,
  replaceChannel,
  setFocusedChannels,
  setLayoutMode,
  slotOrder,
  swapChannels,
  toggleFocusedChannel,
} from './operations';
import { sanitizeView } from './validate';
import { hashToView, viewToHash } from './urlHash';

const base = () => addChannels(emptyView(), ['a', 'b', 'c', 'd']);

describe('multi-focus state', () => {
  it('starts a fresh multi-focus view after the old streams have been closed', () => {
    let v = setLayoutMode(base(), 'multi-focus');
    for (const c of v.channels) v = removeChannel(v, c);
    v = addChannels(v, ['newa', 'newb', 'newc']);
    expect(focusedChannels(v)).toEqual(['newa', 'newb']);
    expect(v.audio).toEqual({ mode: 'mix', active: ['newa', 'newb'] });
  });
  it('starts with two streams and limits selection to three distinct existing channels', () => {
    let v = setLayoutMode(base(), 'multi-focus');
    expect(focusedChannels(v)).toEqual(['a', 'b']);
    expect(v.audio).toEqual({ mode: 'mix', active: ['a', 'b'] });
    v = toggleFocusedChannel(v, 'd');
    expect(slotOrder(v)).toEqual(['a', 'b', 'd', 'c']);
    expect(toggleFocusedChannel(v, 'c')).toBe(v);
    expect(toggleFocusedChannel(v, 'unknown')).toBe(v);
    v = toggleFocusedChannel(v, 'b');
    expect(v.audio.active).toEqual(['a', 'd']);
    v = toggleFocusedChannel(v, 'a');
    expect(toggleFocusedChannel(v, 'd')).toBe(v);
  });

  it('keeps focus and audio attached to replaced and swapped slots, and prunes removals', () => {
    let v = setFocusedChannels(base(), ['c', 'a']);
    v = replaceChannel(v, 'c', 'z');
    expect(focusedChannels(v)).toEqual(['z', 'a']);
    expect(v.audio.active).toEqual(['z', 'a']);
    v = swapChannels(v, 'z', 'b');
    expect(focusedChannels(v)).toEqual(['b', 'a']);
    expect(v.audio.active).toEqual(['b', 'a']);
    v = removeChannel(v, 'b');
    expect(focusedChannels(v)).toEqual(['a']);
    expect(v.audio.active).toEqual(['a']);
  });

  it('round-trips saved views and share links; invalid and duplicate focus entries are dropped', () => {
    const v = setFocusedChannels(base(), ['c', 'a', 'd']);
    expect(sanitizeView(v)).toEqual(v);
    expect(hashToView(viewToHash(v))).toEqual({
      channels: v.channels,
      mode: 'multi-focus',
      main: null,
      focused: ['c', 'a', 'd'],
    });
    expect(
      sanitizeView({ ...v, layout: { ...v.layout, focused: ['c', 'c', 'unknown', 'a', 'd', 'b'] } })
        ?.layout.focused,
    ).toEqual(['c', 'a', 'd']);
    expect(hashToView('#/a/b/c?layout=multi-focus&focus=c,c,unknown,a')?.focused).toEqual([
      'c',
      'a',
    ]);
    expect(hashToView('#/a/b/c?layout=multi-focus')?.focused).toEqual(['a', 'b']);
    expect(sanitizeView(base())?.layout).toEqual(base().layout);
  });
});
