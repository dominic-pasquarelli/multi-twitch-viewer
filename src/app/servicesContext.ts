import { createContext, useContext } from 'react';
import { ENV_CLIENT_ID } from '@/config/appConfig';
import type { PlayerFactory } from '@/lib/player/types';
import type { TwitchApi } from '@/lib/twitch/types';
import { useSettings } from '@/state/settingsStore';

export interface Services {
  /** null until a Client ID is configured and you are logged in. */
  api: TwitchApi | null;
  playerFactory: PlayerFactory;
  clientId: string;
  mock: boolean;
}

export const ServicesContext = createContext<Services | null>(null);

/** The Client ID from settings, falling back to VITE_TWITCH_CLIENT_ID. */
export const useClientId = (): string => {
  const override = useSettings((s) => s.clientId.trim());
  return override || ENV_CLIENT_ID;
};

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used inside <ServicesProvider>');
  return ctx;
}
