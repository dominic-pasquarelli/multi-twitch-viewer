import { useMemo, type ReactNode } from 'react';
import { IS_MOCK } from '@/config/appConfig';
import { createHelixApi } from '@/lib/twitch/helixApi';
import { desktop } from '@/lib/desktop/bridge';
import {
  createMockApi,
  MOCK_CHANNELS,
  mockFollow,
  mockHue,
  setMockLive,
  setMockCategory,
} from '@/lib/twitch/mockApi';
import { createKickApi } from '@/lib/kick/kickApi';
import { createMockKickApi, setMockKickLive } from '@/lib/kick/mockKickApi';
import { createKickPlayerFactory } from '@/lib/player/kickEmbed';
import { twitchPlayerFactory } from '@/lib/player/twitchEmbed';
import { createMockPlayerFactory } from '@/lib/player/mockPlayer';
import { useAuth } from '@/state/authStore';
import { useSettings } from '@/state/settingsStore';
import { offlineDrop } from '@/features/viewer/useDropOfflineStreams';
import { ServicesContext, useClientId, type Services } from './servicesContext';

const mockPlayers = createMockPlayerFactory({
  isLive: (login) => MOCK_CHANNELS.find((c) => c.login === login)?.live ?? true,
  hueFor: mockHue,
});
const mockKickPlayers = {
  ...createMockPlayerFactory({ hueFor: () => 140, platform: 'kick' }),
  capabilities: { volume: true, playbackState: false },
};
// The desktop app can reach into Kick's player frames; a browser can't.
const kickControl = desktop?.kickPlayer;
const kickPlayers = createKickPlayerFactory(
  kickControl ? (id, command) => kickControl(id, command) : undefined,
);

// Test/demo hooks in mock mode: simulate going live, or a player pausing itself.
if (IS_MOCK) {
  (window as unknown as { mtvMock: unknown }).mtvMock = {
    setCategory: setMockCategory,
    // Like Twitch: the channel's status changes, and a player that is showing
    // it reports the stream ended.
    setLive: (login: string, live: boolean) => {
      setMockLive(login, live);
      if (!live)
        mockPlayers.instances.filter((p) => p.channel === login).forEach((p) => p.emit('offline'));
    },
    setOfflineGrace: (ms: number) => (offlineDrop.graceMs = ms),
    setKickLive: (slug: string, live: boolean) => setMockKickLive(slug, live),
    pause: (login: string) =>
      mockPlayers.instances
        .filter((p) => p.channel === login)
        .at(-1)
        ?.pause(),
  };
}

/** Twitch's page for the channel: in-app window (desktop), new tab, or fake (mock). */
async function openFollowPage(login: string): Promise<void> {
  if (IS_MOCK) {
    mockFollow(login);
    return;
  }
  if (desktop?.openTwitchChannel) return desktop.openTwitchChannel(login);
  window.open(`https://www.twitch.tv/${encodeURIComponent(login)}`, '_blank', 'noopener');
  // Back when this window gets focus again.
  await new Promise<void>((resolve) =>
    window.addEventListener('focus', () => resolve(), { once: true }),
  );
}

/**
 * Chooses the real Twitch implementations or the mock ones. Features only see
 * the interfaces, so they work the same either way (and tests can inject fakes).
 */
export function ServicesProvider({
  children,
  override,
}: {
  children: ReactNode;
  override?: Partial<Services>;
}) {
  const clientId = useClientId();
  const hasToken = useAuth((s) => !!s.token);
  const kickClientId = useSettings((s) => s.kickClientId.trim());
  const kickClientSecret = useSettings((s) => s.kickClientSecret.trim());

  const value = useMemo<Services>(() => {
    const api = IS_MOCK
      ? createMockApi()
      : clientId && hasToken
        ? createHelixApi({
            clientId,
            getToken: () => useAuth.getState().token,
            onUnauthorized: () => useAuth.getState().markExpired(),
          })
        : null;
    const kickApi = IS_MOCK
      ? createMockKickApi()
      : kickClientId && kickClientSecret
        ? createKickApi({ clientId: kickClientId, clientSecret: kickClientSecret })
        : null;
    return {
      api,
      playerFactory: IS_MOCK ? mockPlayers : twitchPlayerFactory,
      kickApi,
      kickPlayerFactory: IS_MOCK ? mockKickPlayers : kickPlayers,
      clientId,
      mock: IS_MOCK,
      openFollowPage,
      ...override,
    };
  }, [clientId, hasToken, kickClientId, kickClientSecret, override]);

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}
