import { describe, expect, it } from 'vitest';
import { addChannels, emptyView, setFocusedChannels } from '../view/operations';
import { DEFAULT_MIX, mixPriorities, outputPercent, sanitizeMix } from './mixPreferences';
import { fixedMixRole, streamVolume, type VolumeModel } from './volumeModel';

describe('mix preferences', () => {
  it('validates persisted levels and a maximum of three unique channel priorities', () => {
    expect(sanitizeMix(null)).toEqual(DEFAULT_MIX);
    expect(
      sanitizeMix({
        priorities: [' A ', 'a', '@b', 'bad!', 7, 'c', 'd'],
        priorityLevel: 2,
        backgroundLevel: NaN,
        enabled: 'yes',
      }),
    ).toEqual({ ...DEFAULT_MIX, priorities: ['a', 'b', 'c'], priorityLevel: 1 });
    expect(sanitizeMix({ priorityLevel: -1, backgroundLevel: Infinity }).priorityLevel).toBe(0);
  });

  it('follows focus, ignores mute, excludes the DJ, and honors isolated groups', () => {
    const view = setFocusedChannels(addChannels(emptyView(), ['a', 'b', 'c', 'dj']), [
      'a',
      'b',
      'dj',
    ]);
    expect(mixPriorities(view, DEFAULT_MIX, 'dj')).toEqual(['a', 'b']);
    view.audio.active = [];
    expect(mixPriorities(view, DEFAULT_MIX, 'dj')).toEqual(['a', 'b']);
    view.groups = [{ id: 'g', name: 'Group', channels: ['b', 'c'] }];
    view.activeGroup = 'g';
    expect(mixPriorities(view, DEFAULT_MIX, 'dj')).toEqual(['b']);
    view.layout.mode = 'focus';
    expect(mixPriorities(view, DEFAULT_MIX, 'dj', 'c')).toEqual(['c']);
    view.layout.mode = 'grid';
    expect(mixPriorities(view, DEFAULT_MIX, 'dj', 'c')).toEqual(['b']);
    expect(mixPriorities(view, DEFAULT_MIX, 'dj', null, ['c'])).toEqual(['c']);
  });

  it('manual priorities do not follow visual changes and omit absent channels', () => {
    const view = addChannels(emptyView(), ['a', 'b', 'dj']);
    expect(
      mixPriorities(
        view,
        { ...DEFAULT_MIX, prioritySource: 'manual', priorities: ['b', 'dj', 'absent'] },
        'dj',
      ),
    ).toEqual(['b']);
  });

  it('shows output after volume scaling and mute without claiming measured loudness', () => {
    expect(outputPercent(0.7, 1, 0.5, false)).toBe(35);
    expect(outputPercent(0.7, 0.2, 0.5, false)).toBe(7);
    expect(outputPercent(0.7, 1, 0.5, true)).toBe(0);
    expect(outputPercent(0.7, 1, 0, false)).toBe(0);
  });
});

describe('fixed mix levels', () => {
  const model: VolumeModel = {
    consistent: true,
    master: 0.1,
    volumes: { a: 0.11, bg: 0.32 },
    balance: { bg: 0.5 },
    priorityMain: 'bg',
    musicChannel: 'dj',
    musicVolume: 0.25,
    mix: { priorities: ['a', 'b', 'dj'], priorityLevel: 0.7, backgroundLevel: 0.2 },
  };
  it('uses absolute fixed levels ahead of consistent volume and keeps the DJ separate', () => {
    expect(streamVolume(model, 'a')).toBe(0.7);
    expect(streamVolume(model, 'b')).toBe(0.7);
    expect(streamVolume(model, 'bg')).toBe(0.2);
    expect(streamVolume(model, 'dj')).toBe(0.25);
    expect(fixedMixRole(model, 'dj')).toBe('music');
  });
  it('can leave background streams at their manual balances and accept silence', () => {
    const m = {
      ...model,
      priorityMain: null,
      mix: { ...model.mix!, priorityLevel: 0, backgroundLevel: null },
    };
    expect(streamVolume(m, 'a')).toBe(0);
    expect(streamVolume(m, 'bg')).toBe(0.05);
    expect(fixedMixRole(m, 'bg')).toBeNull();
  });
});
