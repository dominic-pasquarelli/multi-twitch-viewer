import { describe, expect, it } from 'vitest';
import { recordWatch, renameEntry, sanitizeHistory } from './watchHistory';

describe('watch history', () => {
  it('puts the latest on top, once, and keeps a limit', () => {
    let h = recordWatch([], { login: 'a', displayName: 'A', lastWatched: 1 });
    h = recordWatch(h, { login: 'b', displayName: 'B', lastWatched: 2 });
    h = recordWatch(h, { login: 'a', displayName: 'a', lastWatched: 3 });
    expect(h.map((e) => e.login)).toEqual(['a', 'b']);
    expect(h[0]!.displayName).toBe('A'); // a known display name isn't lost
    expect(recordWatch(h, { login: 'c', displayName: 'C', lastWatched: 4 }, 2)).toHaveLength(2);
  });
  it('renames in place', () => {
    const h = [
      { login: 'a', displayName: 'a', lastWatched: 1 },
      { login: 'b', displayName: 'b', lastWatched: 2 },
    ];
    expect(renameEntry(h, 'b', 'Bee')[1]!.displayName).toBe('Bee');
  });
  it('drops malformed stored data', () => {
    expect(
      sanitizeHistory([
        { login: 'ok', displayName: 'Ok', lastWatched: 1 },
        { login: 'Bad Name', lastWatched: 1 },
        { login: 'nodate' },
        null,
      ]),
    ).toEqual([{ login: 'ok', displayName: 'Ok', lastWatched: 1 }]);
    expect(sanitizeHistory('nope')).toEqual([]);
  });
});
