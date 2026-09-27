import { useMemo, type ReactNode } from 'react';
import { IS_MOCK } from '@/config/appConfig';
import { createHelixApi } from '@/lib/twitch/helixApi';
import { createMockApi, MOCK_CHANNELS, mockHue, setMockLive } from '@/lib/twitch/mockApi';
import { twitchPlayerFactory } from '@/lib/player/twitchEmbed';
import { createMockPlayerFactory } from '@/lib/player/mockPlayer';
import { useAuth } from '@/state/authStore';
import { ServicesContext, useClientId, type Services } from './servicesContext';

if (IS_MOCK) (window as unknown as { mtvMock: unknown }).mtvMock = { setLive: setMockLive };

const mockPlayers = createMockPlayerFactory({
  isLive: (login) => MOCK_CHANNELS.find((c) => c.login === login)?.live ?? true,
  hueFor: mockHue,
});

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
      ...override,
    };
  }, [clientId, hasToken, override]);

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}
