import { describe, expect, it } from 'vitest';
import { formatCount, formatUptime, sizedThumbnail } from './format';

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [12_345, '12.3K'],
    [123_456, '123K'],
    [1_234_567, '1.2M'],
  ])('%i → %s', (n, s) => expect(formatCount(n)).toBe(s));
});

describe('formatUptime', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  it('formats hours and minutes', () => {
    expect(formatUptime('2026-01-01T09:55:00Z', now)).toBe('2h 05m');
    expect(formatUptime('2026-01-01T11:46:30Z', now)).toBe('13m');
  });
  it('returns empty for bad input', () => expect(formatUptime('nope', now)).toBe(''));
});

it('sizedThumbnail fills the template', () => {
  expect(sizedThumbnail('https://x/live_user_a-{width}x{height}.jpg', 320, 180)).toBe(
    'https://x/live_user_a-320x180.jpg',
  );
});
