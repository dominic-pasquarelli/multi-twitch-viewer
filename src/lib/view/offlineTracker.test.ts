import { describe, expect, it } from 'vitest';
import { OfflineTracker } from './offlineTracker';

describe('OfflineTracker', () => {
  const live = (set: string[]) => (l: string) => set.includes(l);

  it('drops a stream that was live and stays offline past the grace period', () => {
    const t = new OfflineTracker(60_000);
    expect(t.update(['a', 'b'], live(['a', 'b']), 0)).toEqual([]);
    expect(t.update(['a', 'b'], live(['a']), 1_000)).toEqual([]); // b just went offline
    expect(t.update(['a', 'b'], live(['a']), 30_000)).toEqual([]);
    expect(t.update(['a', 'b'], live(['a']), 61_000)).toEqual(['b']);
  });

  it('keeps a stream that comes back within the grace period', () => {
    const t = new OfflineTracker(60_000);
    t.update(['a'], live(['a']), 0);
    t.update(['a'], live([]), 1_000);
    t.update(['a'], live(['a']), 30_000); // reconnected
    expect(t.update(['a'], live([]), 70_000)).toEqual([]); // offline clock restarted
    expect(t.update(['a'], live([]), 131_000)).toEqual(['a']);
  });

  it('never drops a stream that was offline when added', () => {
    const t = new OfflineTracker(1);
    expect(t.update(['a'], live([]), 0)).toEqual([]);
    expect(t.update(['a'], live([]), 10_000)).toEqual([]);
  });

  it('starts over for a stream that is removed and added again', () => {
    const t = new OfflineTracker(10);
    t.update(['a'], live(['a']), 0);
    t.update([], live([]), 5);
    expect(t.update(['a'], live([]), 100)).toEqual([]);
  });
});
