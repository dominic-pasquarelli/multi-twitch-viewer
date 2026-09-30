import type {
  ChannelSearchResult,
  FollowedChannel,
  LiveStream,
  TwitchApi,
  TwitchUser,
} from './types';

/**
 * Fake Twitch data for `npm run dev:mock`, demos and tests. No network access.
 * Liveness is deterministic so screenshots and tests are stable.
 */

const GAMES = ['Just Chatting', 'Counter-Strike 2', 'Minecraft', 'Elden Ring', 'Valorant', 'Chess'];
const HUES = [265, 200, 150, 30, 330, 50, 180, 0, 100, 290, 220, 15];

interface MockChannel {
  id: string;
  login: string;
  displayName: string;
  live: boolean;
  gameName: string;
  title: string;
  viewers: number;
  hue: number;
}

const NAMES = [
  'PixelPaladin',
  'NovaStrike',
  'CozyCartographer',
  'ByteBard',
  'LunarLatte',
  'QuickScopeQueen',
  'SpeedrunSage',
  'RetroRanger',
  'ChessGoblin',
  'SynthWaveSam',
  'MapleMage',
  'TurboTortoise',
  'GlitchGardener',
  'StormChaserTV',
  'OrbitalOtter',
  'CaffeineCoder',
  'VelvetVoyager',
  'DungeonDad',
  'HoloHarper',
  'FrostFalcon',
  'MidnightMechanic',
  'PaperPlanePilot',
  'EchoEmber',
  'WaffleWizard',
];

/** Mock channels are mutable so tests and demos can simulate going live. */
export const MOCK_CHANNELS: MockChannel[] = NAMES.map((displayName, i) => ({
  id: String(1000 + i),
  login: displayName.toLowerCase(),
  displayName,
  live: i % 5 !== 3 && i < 16,
  gameName: GAMES[i % GAMES.length]!,
  title: `${displayName} stream #${i + 1} — come hang out!`,
  viewers: Math.round(40_000 / (i + 1) ** 1.3),
  hue: HUES[i % HUES.length]!,
}));

/** Simulates a channel going live/offline (mock mode only; exposed as window.mtvMock). */
export function setMockLive(login: string, live: boolean): void {
  const channel = MOCK_CHANNELS.find((c) => c.login === login);
  if (channel) channel.live = live;
}

/** Simulates following a channel on Twitch (mock mode only). */
export function mockFollow(login: string): void {
  if (!MOCK_CHANNELS.some((c) => c.login === login)) MOCK_CHANNELS.push(lookup(login));
}

export const MOCK_ME: TwitchUser = {
  id: '42',
  login: 'you',
  displayName: 'You',
  profileImageUrl: avatar('You', 265),
};

export function mockHue(login: string): number {
  const known = MOCK_CHANNELS.find((c) => c.login === login);
  if (known) return known.hue;
  let h = 0;
  for (const ch of login) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function avatar(name: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 60% 45%)"/><text x="32" y="42" font-family="sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${name.slice(0, 1).toUpperCase()}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function thumbnail(name: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 35%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 70% 20%)"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="160" y="100" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">${name}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const toUser = (c: MockChannel): TwitchUser => ({
  id: c.id,
  login: c.login,
  displayName: c.displayName,
  profileImageUrl: avatar(c.displayName, c.hue),
});

const startedAt = (c: MockChannel) =>
  new Date(Date.now() - (Number(c.id) % 7) * 47 * 60_000 - 5 * 60_000).toISOString();

const toStream = (c: MockChannel): LiveStream => ({
  userId: c.id,
  login: c.login,
  displayName: c.displayName,
  gameName: c.gameName,
  title: c.title,
  viewerCount: c.viewers,
  startedAt: startedAt(c),
  thumbnailUrl: thumbnail(c.displayName, c.hue),
});

/** Channels not in MOCK_CHANNELS are treated as live, so typed names show a player. */
function lookup(login: string): MockChannel {
  return (
    MOCK_CHANNELS.find((c) => c.login === login) ?? {
      id: `x-${login}`,
      login,
      displayName: login,
      live: true,
      gameName: 'Software and Game Development',
      title: `${login} is live`,
      viewers: 123,
      hue: mockHue(login),
    }
  );
}

const delay = <T>(value: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export function createMockApi(): TwitchApi {
  return {
    getMe: () => delay(MOCK_ME),
    getFollowedStreams: () =>
      delay(
        MOCK_CHANNELS.filter((c) => c.live)
          .sort((a, b) => b.viewers - a.viewers)
          .map(toStream),
      ),
    getFollowedChannels: () =>
      delay(
        MOCK_CHANNELS.map((c): FollowedChannel => ({
          id: c.id,
          login: c.login,
          displayName: c.displayName,
          followedAt: '2024-01-01T00:00:00Z',
        })),
      ),
    getUsersByIds: (ids) => delay(MOCK_CHANNELS.filter((c) => ids.includes(c.id)).map(toUser)),
    getUsersByLogins: (logins) => delay(logins.map((l) => toUser(lookup(l)))),
    getStreamsByLogins: (logins) =>
      delay(
        logins
          .map(lookup)
          .filter((c) => c.live)
          .map(toStream),
      ),
    searchChannels: (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return delay([]);
      const matches = MOCK_CHANNELS.filter((c) => c.login.includes(q));
      const results = matches.map((c): ChannelSearchResult => ({
        id: c.id,
        login: c.login,
        displayName: c.displayName,
        isLive: c.live,
        gameName: c.gameName,
        title: c.title,
        profileImageUrl: avatar(c.displayName, c.hue),
      }));
      return delay(results.slice(0, 12));
    },
  };
}
