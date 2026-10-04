import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizeUrl,
  chunk,
  createHelixApi,
  hasScopes,
  parseAuthCallback,
  TwitchApiError,
  validateToken,
} from './index';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

describe('auth helpers', () => {
  it('builds an implicit-grant authorize URL', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'abc',
        redirectUri: 'http://localhost:5757',
        scopes: ['user:read:follows'],
        state: 's1',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://id.twitch.tv/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'token',
      client_id: 'abc',
      redirect_uri: 'http://localhost:5757',
      scope: 'user:read:follows',
      state: 's1',
    });
  });

  it('parses a successful callback fragment', () => {
    expect(
      parseAuthCallback(
        '#access_token=tok&scope=user%3Aread%3Afollows&state=s1&token_type=bearer',
        '',
      ),
    ).toEqual({ type: 'token', accessToken: 'tok', scopes: ['user:read:follows'], state: 's1' });
  });

  it('parses an error callback', () => {
    expect(
      parseAuthCallback('', '?error=access_denied&error_description=The+user+denied&state=s1'),
    ).toEqual({
      type: 'error',
      error: 'access_denied',
      description: 'The user denied',
      state: 's1',
    });
  });

  it('ignores unrelated URLs', () => {
    expect(parseAuthCallback('#/xqc/shroud', '')).toBeNull();
  });

  it('validates tokens', async () => {
    const fetchOk = vi.fn(async () =>
      json({
        client_id: 'c',
        login: 'me',
        user_id: '1',
        scopes: ['user:read:follows'],
        expires_in: 99,
      }),
    );
    await expect(validateToken('t', fetchOk)).resolves.toEqual({
      clientId: 'c',
      login: 'me',
      userId: '1',
      scopes: ['user:read:follows'],
      expiresIn: 99,
    });
    expect(fetchOk).toHaveBeenCalledWith('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth t' },
    });
    const fetch401 = vi.fn(async () => json({ status: 401 }, 401));
    await expect(validateToken('t', fetch401)).resolves.toBeNull();
  });

  it('checks scopes', () => {
    expect(hasScopes(['a', 'b'], ['a'])).toBe(true);
    expect(hasScopes(['b'], ['a'])).toBe(false);
  });
});

describe('Helix API', () => {
  const setup = (responses: Response[]) => {
    const fetchMock = vi.fn(async (_url: string) => responses.shift() ?? json({ data: [] }));
    const onUnauthorized = vi.fn();
    const api = createHelixApi({
      clientId: 'cid',
      getToken: () => 'tok',
      onUnauthorized,
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
    });
    return { api, fetchMock, onUnauthorized };
  };

  it('sends auth headers and maps the current user', async () => {
    const { api, fetchMock } = setup([
      json({ data: [{ id: '1', login: 'me', display_name: 'Me', profile_image_url: 'p' }] }),
    ]);
    await expect(api.getMe()).resolves.toEqual({
      id: '1',
      login: 'me',
      displayName: 'Me',
      profileImageUrl: 'p',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twitch.tv/helix/users?');
    expect(init.headers).toEqual({ 'Client-Id': 'cid', Authorization: 'Bearer tok' });
  });

  it('follows pagination cursors for followed channels', async () => {
    const f = (n: number) => ({
      broadcaster_id: String(n),
      broadcaster_login: `c${n}`,
      broadcaster_name: `C${n}`,
      followed_at: 'x',
    });
    const { api, fetchMock } = setup([
      json({ data: [f(1), f(2)], pagination: { cursor: 'next' } }),
      json({ data: [f(3)], pagination: {} }),
    ]);
    const follows = await api.getFollowedChannels('42');
    expect(follows.map((x) => x.login)).toEqual(['c1', 'c2', 'c3']);
    expect(fetchMock.mock.calls[1]![0]).toContain('after=next');
    expect(fetchMock.mock.calls[0]![0]).toContain('user_id=42');
  });

  it('queries streams by repeated user_login params', async () => {
    const { api, fetchMock } = setup([json({ data: [] })]);
    await api.getStreamsByLogins(['a', 'b']);
    expect(fetchMock.mock.calls[0]![0]).toContain('user_login=a&user_login=b');
  });

  it('searches category names and maps category artwork', async () => {
    const { api, fetchMock } = setup([
      json({ data: [{ id: '42', name: 'Just Chatting', box_art_url: 'box-art' }] }),
    ]);
    await expect(api.searchCategories(' Just Chatting ')).resolves.toEqual([
      { id: '42', name: 'Just Chatting', boxArtUrl: 'box-art' },
    ]);
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.pathname).toBe('/helix/search/categories');
    expect(url.searchParams.get('query')).toBe('Just Chatting');
    await expect(api.searchCategories(' ')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('browses category streams with pagination and supported metadata', async () => {
    const { api, fetchMock } = setup([
      json({
        data: [
          {
            user_id: '1',
            user_login: 'sample',
            user_name: 'Sample',
            game_name: 'Chess',
            title: 'Rapid games',
            viewer_count: 22,
            started_at: '2026-10-04T12:00:00Z',
            thumbnail_url: 'live-{width}x{height}',
            type: 'live',
            tags: ['English', 'Strategy'],
            language: 'en',
          },
        ],
        pagination: { cursor: 'next page' },
      }),
      json({ data: [], pagination: {} }),
    ]);
    const first = await api.getStreamsByCategory('743');
    expect(first.cursor).toBe('next page');
    expect(first.streams[0]).toMatchObject({
      login: 'sample',
      title: 'Rapid games',
      thumbnailUrl: 'live-{width}x{height}',
      tags: ['English', 'Strategy'],
      language: 'en',
    });
    await expect(api.getStreamsByCategory('743', first.cursor)).resolves.toEqual({
      streams: [],
      cursor: undefined,
    });
    const url = new URL(fetchMock.mock.calls[1]![0]);
    expect(url.pathname).toBe('/helix/streams');
    expect(url.searchParams.get('game_id')).toBe('743');
    expect(url.searchParams.get('after')).toBe('next page');
  });

  it('reports 401 and throws', async () => {
    const { api, onUnauthorized } = setup([json({ message: 'Invalid OAuth token' }, 401)]);
    await expect(api.getMe()).rejects.toBeInstanceOf(TwitchApiError);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('retries once after a 429', async () => {
    const { api, fetchMock } = setup([
      json({}, 429, { 'Ratelimit-Reset': '0' }),
      json({ data: [{ id: '1', login: 'me', display_name: 'Me', profile_image_url: 'p' }] }),
    ]);
    await expect(api.getMe()).resolves.toMatchObject({ login: 'me' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces Helix error messages', async () => {
    const { api } = setup([json({ message: 'Bad thing' }, 400)]);
    await expect(api.searchChannels('x')).rejects.toThrow('Bad thing');
  });
});

it('chunk splits arrays', () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});

it('builds the chat embed URL', async () => {
  const { chatEmbedUrl } = await import('./embedUrls');
  expect(chatEmbedUrl('xqc', 'localhost')).toBe(
    'https://www.twitch.tv/embed/xqc/chat?darkpopout&parent=localhost',
  );
});
