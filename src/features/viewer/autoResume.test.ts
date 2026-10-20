import { describe, expect, it } from 'vitest';
import { AutoResume } from './autoResume';
import {
  clearInteraction,
  interactedRecently,
  markInteraction,
  markSelection,
  pausedByUser,
  SELECTION_GRACE_MS,
  selectedRecently,
  setIntentionalPause,
} from './playerInteraction';

describe('AutoResume', () => {
  it('resumes pauses the user did not make, up to a limit per minute', () => {
    let now = 0;
    const r = new AutoResume(3, () => now);
    expect(r.shouldResume(true)).toBe(false);
    expect([r.shouldResume(false), r.shouldResume(false), r.shouldResume(false)]).toEqual([
      true,
      true,
      true,
    ]);
    expect(r.shouldResume(false)).toBe(false); // stop fighting the player
    now = 61_000;
    expect(r.shouldResume(false)).toBe(true);
  });
});

it('remembers recent interaction per stream', () => {
  markInteraction('a', 1000);
  expect(interactedRecently('a', 3000, 3500)).toBe(true);
  expect(interactedRecently('a', 3000, 5000)).toBe(false);
  expect(interactedRecently('b', 3000, 1000)).toBe(false);
});

describe('selection grace', () => {
  it('treats a pause right after the selecting click as not yours', () => {
    const now = Date.now();
    markInteraction('sel', now); // the click into the player…
    expect(pausedByUser('sel')).toBe(true);
    markSelection('sel', now); // …made it the main stream
    expect(selectedRecently('sel', now + 700)).toBe(true);
    expect(pausedByUser('sel')).toBe(false);
    expect(selectedRecently('sel', now + SELECTION_GRACE_MS + 1)).toBe(false);
  });

  it('ends at your next click into that player, or when it is closed', () => {
    const now = Date.now();
    markInteraction('again', now);
    markSelection('again', now);
    markInteraction('again', now + 500); // you clicked it again, e.g. to pause
    expect(selectedRecently('again', now + 600)).toBe(false);
    expect(pausedByUser('again')).toBe(true);

    markSelection('closed', now);
    clearInteraction('closed');
    expect(selectedRecently('closed', now)).toBe(false);
  });

  it('never overrides an explicit pause', () => {
    const now = Date.now();
    markSelection('held', now);
    setIntentionalPause('held', true);
    expect(pausedByUser('held')).toBe(true);
    setIntentionalPause('held', false);
  });
});
