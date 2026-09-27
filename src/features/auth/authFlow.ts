import { redirectUri } from '@/config/appConfig';
import { buildAuthorizeUrl, createState, REQUIRED_SCOPES, revokeToken } from '@/lib/twitch/auth';
import { useAuth } from '@/state/authStore';

const STATE_KEY = 'mtv:oauth-state';

/** Sends the browser to Twitch's login/consent page. */
export function startLogin(clientId: string, opts: { forceVerify?: boolean } = {}): void {
  const state = createState();
  sessionStorage.setItem(STATE_KEY, state);
  window.location.assign(
    buildAuthorizeUrl({
      clientId,
      redirectUri: redirectUri(),
      scopes: REQUIRED_SCOPES,
      state,
      forceVerify: opts.forceVerify,
    }),
  );
}

/** Returns (and forgets) the state saved before redirecting to Twitch. */
export function takeSavedState(): string | null {
  const state = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return state;
}

export async function logout(clientId: string): Promise<void> {
  const token = useAuth.getState().token;
  useAuth.getState().signOut();
  if (token && clientId) await revokeToken(clientId, token);
}
