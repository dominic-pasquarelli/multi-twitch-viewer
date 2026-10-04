import { describe, expect, it } from 'vitest';
import { matchesChannel, partitionChannelRows, type ChannelRowInfo } from './channelRows';

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

describe('history status sections', () => {
  it('keeps unresolved lookups in Checking and preserves newest-first order per status', () => {
    const rows: ChannelRowInfo[] = [
      { ...row, login: 'new-live' },
      { ...row, login: 'new-offline', stream: undefined, liveKnown: true },
      { ...row, login: 'unknown', stream: undefined, liveKnown: false },
      { ...row, login: 'old-live' },
      { ...row, login: 'old-offline', stream: undefined },
    ];
    const groups = partitionChannelRows(rows);
    expect(groups.live.map((r) => r.login)).toEqual(['new-live', 'old-live']);
    expect(groups.offline.map((r) => r.login)).toEqual(['new-offline', 'old-offline']);
    expect(groups.checking.map((r) => r.login)).toEqual(['unknown']);
    expect(rows.map((r) => r.login)).toEqual([
      'new-live',
      'new-offline',
      'unknown',
      'old-live',
      'old-offline',
    ]);
  });
});
