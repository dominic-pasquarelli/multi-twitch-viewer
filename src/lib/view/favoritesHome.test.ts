import { describe, expect, it } from 'vitest';
import { droppableWhenOffline, favoritesToAdd, liveFavorites } from './favoritesHome';

describe('favorites home', () => {
  it('lists live favorites in the order they were starred', () => {
    const live = new Set(['c', 'a', 'x']);
    expect(liveFavorites(['a', 'b', 'c'], (l) => live.has(l))).toEqual(['a', 'c']);
  });

  it('first sync brings every live favorite that is not on screen', () => {
    expect(favoritesToAdd(['a', 'b', 'c'], null, ['b', 'other'])).toEqual(['a', 'c']);
  });

  it('later syncs bring only favorites that just went live', () => {
    const previous = new Set(['a', 'b']);
    // b was closed by hand: it stays closed while it remains live.
    expect(favoritesToAdd(['a', 'b', 'c'], previous, ['a'])).toEqual(['c']);
    // b went offline and came back: it joins again.
    expect(favoritesToAdd(['a', 'b'], new Set(['a']), ['a'])).toEqual(['b']);
  });

  it('drops favorites in the home view, other streams by the temporary-view rule', () => {
    const favorites = ['fav'];
    const home = { home: true, favorites, temporary: false };
    expect(droppableWhenOffline('fav', home)).toBe(true);
    expect(droppableWhenOffline('extra', home)).toBe(false);
    expect(droppableWhenOffline('extra', { ...home, temporary: true })).toBe(true);
    expect(droppableWhenOffline('fav', { home: false, favorites, temporary: false })).toBe(false);
  });
});
