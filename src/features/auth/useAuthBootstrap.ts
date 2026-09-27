import { useEffect } from 'react';
import { IS_MOCK } from '@/config/appConfig';
import { createHelixApi } from '@/lib/twitch/helixApi';
import { hasScopes, parseAuthCallback, REQUIRED_SCOPES, validateToken } from '@/lib/twitch/auth';
import { MOCK_ME } from '@/lib/twitch/mockApi';
import { useAuth } from '@/state/authStore';
import { toast } from '@/state/toastStore';
import { takeSavedState } from './authFlow';

const HOUR = 60 * 60 * 1000;

/**
 * Finishes a Twitch login redirect, validates the stored token at startup and
 * every hour (Twitch requires this), and marks the session expired when the
 * token stops working.
 */
export function useAuthBootstrap(clientId: string): void {
  // 1. Handle the redirect back from Twitch.
  useEffect(() => {
    if (IS_MOCK) {
      if (!useAuth.getState().token) useAuth.getState().signIn('mock-token', MOCK_ME);
      return;
    }
    const callback = parseAuthCallback(window.location.hash, window.location.search);
    if (!callback) return;
    // Remove the token from the address bar right away.
    window.history.replaceState(null, '', window.location.pathname);
    const expectedState = takeSavedState();
    if (callback.state !== expectedState) {
      toast('Login was ignored because it did not come from this app. Please try again.', {
        tone: 'error',
      });
      return;
    }
    if (callback.type === 'error') {
      toast(`Twitch login failed: ${callback.description}`, { tone: 'error' });
      return;
    }
    if (!clientId) return;
    const token = callback.accessToken;
    const api = createHelixApi({ clientId, getToken: () => token });
    api
      .getMe()
      .then((user) => {
        useAuth.getState().signIn(token, user);
        toast(`Logged in as ${user.displayName}`);
      })
      .catch((err: Error) =>
        toast(`Could not load your Twitch profile: ${err.message}`, { tone: 'error' }),
      );
  }, [clientId]);

  // 2. Validate at startup and hourly.
  const token = useAuth((s) => s.token);
  useEffect(() => {
    if (IS_MOCK || !token) return;
    let cancelled = false;
    const check = async () => {
      try {
        const info = await validateToken(token);
        if (cancelled) return;
        if (!info || !hasScopes(info.scopes, REQUIRED_SCOPES)) useAuth.getState().markExpired();
      } catch {
        // Network trouble: keep the session and try again next hour.
      }
    };
    void check();
    const id = setInterval(check, HOUR);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);
}
