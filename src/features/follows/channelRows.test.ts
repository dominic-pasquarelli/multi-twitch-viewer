import { describe, expect, it } from 'vitest';
import { matchesChannel, type ChannelRowInfo } from './channelRows';

const row: ChannelRowInfo = {
  login: 'sample',
  displayName: 'Sample Channel',
  avatar: '',
  stream: {
    userId: '1',
    login: 'sample',
    displayName: 'Sample Channel',
    gameName: 'Just Chatting',
    title: 'Building a cozy community',
    tags: ['English', 'Programming'],
    language: 'en',
    viewerCount: 10,
    startedAt: '2026-10-04T12:00:00Z',
    thumbnailUrl: 'preview',
  },
};

describe('loaded channel metadata filter', () => {
  it('matches all words across name, category, title, tags and language', () => {
    expect(matchesChannel(row, 'SAMPLE cozy programming en')).toBe(true);
    expect(matchesChannel(row, 'just chatting')).toBe(true);
    expect(matchesChannel(row, 'cozy missing')).toBe(false);
    expect(matchesChannel(row, '   ')).toBe(true);
  });

  it('handles offline channels without inventing live metadata', () => {
    const offline = { ...row, stream: undefined };
    expect(matchesChannel(offline, 'Sample Channel')).toBe(true);
    expect(matchesChannel(offline, 'programming')).toBe(false);
  });
});
