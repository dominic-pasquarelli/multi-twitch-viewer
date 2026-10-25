import { describe, expect, it } from 'vitest';
import { silenceReason } from './silence';

describe('silent stream indicator', () => {
  it('includes explicit mute, zero stream volume and zero output', () => {
    expect(silenceReason(true, 0.8, 1)).toBe('Audio muted');
    expect(silenceReason(false, 0, 1)).toBe('Stream volume is 0%');
    expect(silenceReason(false, null, 0)).toBe('Output level is 0%');
  });
  it('does not mark quiet or unknown player volumes as completely muted', () => {
    expect(silenceReason(false, 0.01, 0.01)).toBeNull();
    expect(silenceReason(false, null, 1)).toBeNull();
  });
  it('does not claim unsupported browser Kick volume controls silence the player', () => {
    expect(silenceReason(false, 0, 0, false)).toBeNull();
    expect(silenceReason(true, 0.5, 1, false)).toBe('Audio muted');
  });
});
