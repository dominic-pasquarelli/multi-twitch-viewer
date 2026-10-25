import { describe, expect, it, vi } from 'vitest';
import type { LiveStream } from '../twitch/types';
import { createKickApi, isoTime, KICK_TOKEN_URL } from './kickApi';
import { kickChatUrl, kickPlayerUrl, parseKickSlug, sanitizeKickLinks } from './links';
import { kickLiveByLogin, kickSlugFor, withKickLive } from './liveMerge';
import type { KickChannel } from './types';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('kick links', () => {
  it('reads slugs from names and kick.com links', () => {
    expect(parseKickSlug('  @Some_Streamer ')).toBe('some_streamer');
    expect(parseKickSlug('https://kick.com/xqc')).toBe('xqc');
    expect(parseKickSlug('kick.com/popout/my-name/chat')).toBe('my-name');
    expect(parseKickSlug('https://player.kick.com/abc?muted=true')).toBe('abc');
    expect(parseKickSlug('https://twitch.tv/xqc')).toBeNull();
    expect(parseKickSlug('bad name!')).toBeNull();
  });

  it('keeps only valid links when loading', () => {
    expect(
      sanitizeKickLinks({ XQC: 'xqc', 'bad login!': 'x', ok: 7, alpha: 'kick.com/Alpha' }),
    ).toEqual({ xqc: 'xqc', alpha: 'alpha' });
    expect(sanitizeKickLinks(null)).toEqual({});
  });

  it('builds player and chat URLs', () => {
    expect(kickPlayerUrl('xqc', { muted: true, id: 'k1' })).toBe(
      'https://player.kick.com/xqc?autoplay=true&muted=true&mtv=k1',
    );
    expect(kickChatUrl('xqc')).toBe('https://kick.com/popout/xqc/chat');
  });
});

describe('createKickApi', () => {
  it('signs in with client credentials once, then batches slugs 50 at a time', async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(u === KICK_TOKEN_URL ? `token ${String(init?.body)}` : u);
      if (u === KICK_TOKEN_URL) return json({ access_token: 'tok', expires_in: 3600 });
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      const slugs = new URL(u).searchParams.getAll('slug');
      return json({
        data: slugs.map((slug) => ({
          slug,
          stream_title: `${slug} title`,
          category: { name: 'IRL' },
          stream: { is_live: slug === 's1', viewer_count: 5, start_time: '2026-01-01T00:00:00Z' },
        })),
      });
    });
    const api = createKickApi({ clientId: 'id', clientSecret: 'secret', fetch });
    const slugs = Array.from({ length: 60 }, (_, i) => `s${i}`);
    const channels = await api.getChannels(slugs);
    expect(channels).toHaveLength(60);
    expect(channels.find((c) => c.slug === 's1')).toMatchObject({
      isLive: true,
      title: 's1 title',
      categoryName: 'IRL',
      viewerCount: 5,
    });
    expect(calls.filter((c) => c.startsWith('token'))).toEqual([
      'token grant_type=client_credentials&client_id=id&client_secret=secret',
    ]);
    expect(
      calls
        .filter((c) => c.includes('/channels?'))
        .map((c) => new URL(c).searchParams.getAll('slug').length),
    ).toEqual([50, 10]);
    await api.getChannels(['s1']);
    expect(calls.filter((c) => c.startsWith('token'))).toHaveLength(1); // cached
  });

  it('signs in again once when Kick rejects the token, and explains bad credentials', async () => {
    let tokens = 0;
    let rejected = false;
    const fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === KICK_TOKEN_URL)
        return json({ access_token: `t${++tokens}`, expires_in: 3600 });
      if (!rejected) {
        rejected = true;
        return json({ message: 'Unauthorized' }, 401);
      }
      return json({ data: [] });
    });
    await createKickApi({ clientId: 'a', clientSecret: 'b', fetch }).getChannels(['x']);
    expect(tokens).toBe(2);

    const bad = createKickApi({
      clientId: 'a',
      clientSecret: 'b',
      fetch: async () => json({ error: 'invalid_client' }, 401),
    });
    await expect(bad.getChannels(['x'])).rejects.toThrow('Kick rejected the Client ID or Secret');
  });
});

it('reads Kick start times in either format', () => {
  expect(isoTime('2026-10-20 19:22:23')).toBe('2026-10-20T19:22:23.000Z');
  expect(isoTime('2026-10-20T19:22:23Z')).toBe('2026-10-20T19:22:23.000Z');
  expect(isoTime('soon')).toBe('');
  expect(isoTime(undefined)).toBe('');
});

describe('kick live merge', () => {
  const kick = (slug: string, isLive: boolean): KickChannel => ({
    slug,
    isLive,
    title: 'on kick',
    categoryName: 'IRL',
    viewerCount: 9,
    startedAt: '',
    thumbnailUrl: '',
  });
  const twitch = (login: string) => ({ login, displayName: login }) as LiveStream;

  it('lists linked channels live on Kick under their Twitch login', () => {
    const live = kickLiveByLogin({ alpha: 'alpha_kick', bravo: 'bravo' }, [
      kick('alpha_kick', true),
      kick('bravo', false),
    ]);
    expect([...live.keys()]).toEqual(['alpha']);
    expect(live.get('alpha')).toMatchObject({ platform: 'kick', kickSlug: 'alpha_kick' });
    expect(kickSlugFor(live.get('alpha'))).toBe('alpha_kick');
    expect(kickSlugFor(twitch('alpha'))).toBeNull();
  });

  it('prefers Twitch, and only adds Kick for the given logins', () => {
    const live = kickLiveByLogin({ alpha: 'a', bravo: 'b', charlie: 'c' }, [
      kick('a', true),
      kick('b', true),
      kick('c', true),
    ]);
    const merged = withKickLive(
      [twitch('alpha')],
      live,
      ['alpha', 'bravo'],
      new Map([['bravo', 'Bravo']]),
    );
    expect(merged.map((s) => [s.login, s.platform ?? 'twitch', s.displayName])).toEqual([
      ['alpha', 'twitch', 'alpha'],
      ['bravo', 'kick', 'Bravo'],
    ]);
  });

  it('opens a direct Kick channel independently while linked identities still prefer live Twitch', () => {
    const live = kickLiveByLogin({ alpha: 'a' }, [kick('a', true)], ['kick:a']);
    expect(
      withKickLive([twitch('alpha')], live, ['alpha', 'kick:a']).map((s) => [
        s.login,
        s.platform ?? 'twitch',
      ]),
    ).toEqual([
      ['alpha', 'twitch'],
      ['kick:a', 'kick'],
    ]);
    expect(live.get('kick:a')?.displayName).toBe('a');
  });
});
