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
} from '@/lib/twitch/mockApi';
import { twitchPlayerFactory } from '@/lib/player/twitchEmbed';
import { createMockPlayerFactory } from '@/lib/player/mockPlayer';
import { useAuth } from '@/state/authStore';
import { offlineDrop } from '@/features/viewer/useDropOfflineStreams';
import { ServicesContext, useClientId, type Services } from './servicesContext';

const mockPlayers = createMockPlayerFactory({
  isLive: (login) => MOCK_CHANNELS.find((c) => c.login === login)?.live ?? true,
  hueFor: mockHue,
});

// Test/demo hooks in mock mode: simulate going live, or a player pausing itself.
if (IS_MOCK) {
  (window as unknown as { mtvMock: unknown }).mtvMock = {
    // Like Twitch: the channel's status changes, and a player that is showing
    // it reports the stream ended.
    setLive: (login: string, live: boolean) => {
      setMockLive(login, live);
      if (!live)
        mockPlayers.instances.filter((p) => p.channel === login).forEach((p) => p.emit('offline'));
    },
    setOfflineGrace: (ms: number) => (offlineDrop.graceMs = ms),
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
    return {
      api,
      playerFactory: IS_MOCK ? mockPlayers : twitchPlayerFactory,
      clientId,
      mock: IS_MOCK,
      openFollowPage,
      ...override,
    };
  }, [clientId, hasToken, override]);

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}
