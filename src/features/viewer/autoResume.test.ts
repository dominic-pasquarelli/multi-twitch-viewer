import { describe, expect, it } from 'vitest';
import { AutoResume } from './autoResume';
import { interactedRecently, markInteraction } from './playerInteraction';

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
