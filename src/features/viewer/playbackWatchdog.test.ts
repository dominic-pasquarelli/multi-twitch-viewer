import { beforeEach, describe, expect, it } from 'vitest';
import { PlaybackWatchdog, type WatchdogSample } from './playbackWatchdog';

let now = 0;
let watchdog: PlaybackWatchdog;
const sample = (patch: Partial<WatchdogSample> = {}): WatchdogSample => ({
  ready: true,
  status: 'paused',
  paused: true,
  live: true,
  held: false,
  online: true,
  ...patch,
});
beforeEach(() => {
  now = 0;
  watchdog = new PlaybackWatchdog(() => now);
});
describe('playback watchdog', () => {
  it('retries startup and silent pauses, spaced five seconds apart', () => {
    expect(watchdog.check(sample({ status: 'loading' }))).toBe('play');
    now = 1000;
    expect(watchdog.check(sample())).toBeNull();
    now = 5000;
    expect(watchdog.check(sample({ status: 'playing', paused: true }))).toBe('play');
  });
  it('reloads a ready or never-ready player stuck for thirty seconds', () => {
    expect(watchdog.check(sample({ ready: false, status: 'loading' }))).toBeNull();
    now = 30_000;
    expect(watchdog.check(sample({ ready: false, status: 'loading' }))).toBe('reload');
    now = 31_000;
    expect(watchdog.check(sample({ ready: false, status: 'loading' }))).toBeNull();
  });
  it('respects manual, hidden-group and bandwidth holds, disconnected networks and offline channels', () => {
    for (const patch of [{ held: true }, { online: false }, { live: false }])
      expect(watchdog.check(sample(patch))).toBeNull();
    expect(watchdog.check(sample({ live: undefined, status: 'offline' }))).toBeNull();
    expect(watchdog.check(sample({ live: true, status: 'offline' }))).toBe('play');
  });
  it('resets its failure window after successful playback', () => {
    watchdog.check(sample());
    now = 29_000;
    expect(watchdog.check(sample({ status: 'playing', paused: false }))).toBeNull();
    now = 30_000;
    expect(watchdog.check(sample())).toBe('play');
  });
});
