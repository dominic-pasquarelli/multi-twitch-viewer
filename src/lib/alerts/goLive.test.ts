import { describe, expect, it } from 'vitest';
import type { LiveStream } from '../twitch/types';
import { favoritesFirst, newlyLive } from './goLive';

const s = (login: string) => ({ login }) as LiveStream;

describe('newlyLive', () => {
  const now = [s('a'), s('b'), s('c')];
  it('never alerts on the first poll', () => {
    expect(newlyLive(null, now, 'all', [])).toEqual([]);
  });
  it('alerts only for channels that just went live', () => {
    expect(newlyLive(new Set(['a']), now, 'all', []).map((x) => x.login)).toEqual(['b', 'c']);
  });
  it('can be limited to favorites or turned off', () => {
    expect(newlyLive(new Set(['a']), now, 'favorites', ['c']).map((x) => x.login)).toEqual(['c']);
    expect(newlyLive(new Set(), now, 'off', ['a'])).toEqual([]);
  });
});

it('favoritesFirst keeps order within groups', () => {
  expect(favoritesFirst([s('a'), s('b'), s('c'), s('d')], ['c', 'a']).map((x) => x.login)).toEqual([
    'a',
    'c',
    'b',
    'd',
  ]);
});
