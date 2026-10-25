import { expect, it } from 'vitest';
import { WakeSignals } from './wakeSignals';

it('detects scheduler gaps and coalesces repeated wake/unlock/focus notifications', () => {
  let now = 0;
  const signals = new WakeSignals(() => now);
  now = 1000;
  expect(signals.tick()).toBe(false);
  now = 61_000;
  expect(signals.tick()).toBe(true);
  expect(signals.recover(true)).toBe(true);
  expect(signals.recover(true)).toBe(false);
  now += 1000;
  expect(signals.tick()).toBe(false);
  expect(signals.recover(true)).toBe(false);
});

it('defers recovery until the app is visible and the network is online', () => {
  let now = 0;
  const signals = new WakeSignals(() => now);
  expect(signals.recover(false)).toBe(false);
  expect(signals.pending).toBe(true);
  expect(signals.recover(true)).toBe(true);
  expect(signals.pending).toBe(false);
  now = 1000;
  signals.recover(false);
  expect(signals.pending).toBe(true);
  expect(signals.recover(true)).toBe(false);
  expect(signals.pending).toBe(true);
  now = 6000;
  expect(signals.recover(true)).toBe(true);
  expect(signals.pending).toBe(false);
});
