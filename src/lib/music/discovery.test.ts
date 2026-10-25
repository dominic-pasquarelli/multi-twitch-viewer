import { describe, expect, it } from 'vitest';
import type { LiveStream } from '@/lib/twitch/types';
import { musicCategory, musicSuggestion, sanitizeObservations } from './discovery';

describe('music category evidence', () => {
  it('recognizes only Music and DJs categories', () => {
    expect(musicCategory(' music ')).toBe('Music');
    expect(musicCategory('DJs')).toBe('DJs');
    expect(musicCategory('Music Trivia')).toBeNull();
    expect(musicCategory('Just Chatting')).toBeNull();
  });
  it('distinguishes live, last category and locally remembered evidence', () => {
    const live = { gameName: 'DJs' } as LiveStream;
    expect(musicSuggestion(live, undefined, undefined)).toBe('Live in DJs');
    expect(musicSuggestion(undefined, { id: '1', gameName: 'Music' }, undefined)).toBe(
      'Last category: Music',
    );
    expect(
      musicSuggestion({ gameName: 'Chess' } as LiveStream, { id: '1', gameName: 'Music' }, 'DJs'),
    ).toBe('Previously seen in DJs');
    expect(
      musicSuggestion(
        { gameName: 'Chess' } as LiveStream,
        { id: '1', gameName: 'Music' },
        undefined,
      ),
    ).toBeNull();
  });
  it('bounds and sanitizes persisted observations', () => {
    expect(sanitizeObservations(null)).toEqual({});
    expect(sanitizeObservations(['Music'])).toEqual({});
    expect(
      sanitizeObservations({ '10': 'Music', '11': 3, 'bad id': 'DJs', '12': 'Chess' }),
    ).toEqual({ '10': 'Music' });
    expect(
      Object.keys(
        sanitizeObservations(
          Object.fromEntries(Array.from({ length: 1100 }, (_, i) => [String(i), 'Music'])),
        ),
      ),
    ).toHaveLength(1000);
  });
});
