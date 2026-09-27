/**
 * Twitch OAuth "implicit grant" helpers. This flow needs no server or client
 * secret: Twitch redirects back to the app with the token in the URL fragment.
 * Tokens last roughly 60 days; renewing is a one-click redirect because Twitch
 * remembers that you already authorised the app.
 */

export const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
export const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
export const REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';

/** Read the channels you follow and which of them are live. */
export const REQUIRED_SCOPES = ['user:read:follows'] as const;

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  /** Always show Twitch's consent screen (e.g. to switch accounts). */
  forceVerify?: boolean;
}

export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: p.scopes.join(' '),
    state: p.state,
  });
  if (p.forceVerify) params.set('force_verify', 'true');
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type AuthCallback =
  | { type: 'token'; accessToken: string; scopes: string[]; state: string | null }
  | { type: 'error'; error: string; description: string; state: string | null };

/**
 * Reads Twitch's redirect. Success arrives in the fragment
 * (#access_token=…&state=…), errors in the query (?error=…&state=…).
 * Returns null when the URL is not an OAuth callback.
 */
export function parseAuthCallback(hash: string, search: string): AuthCallback | null {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = fragment.get('access_token');
  if (accessToken) {
    return {
      type: 'token',
      accessToken,
      scopes: (fragment.get('scope') ?? '').split(/[\s+]+/).filter(Boolean),
      state: fragment.get('state'),
    };
  }
  const query = new URLSearchParams(search);
  const error = query.get('error') ?? fragment.get('error');
  if (error) {
    return {
      type: 'error',
      error,
      description: query.get('error_description') ?? fragment.get('error_description') ?? error,
      state: query.get('state') ?? fragment.get('state'),
    };
  }
  return null;
}

export interface TokenInfo {
  clientId: string;
  login: string;
  userId: string;
  scopes: string[];
  /** Seconds until expiry (0 means it does not expire). */
  expiresIn: number;
}

/**
 * Twitch requires apps to validate user tokens at startup and hourly.
 * Resolves null when the token is invalid or expired.
 */
export async function validateToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenInfo | null> {
  const res = await fetchImpl(VALIDATE_URL, { headers: { Authorization: `OAuth ${token}` } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Token validation failed (${res.status})`);
  const body = (await res.json()) as {
    client_id: string;
    login: string;
    user_id: string;
    scopes: string[] | null;
    expires_in: number;
  };
  return {
    clientId: body.client_id,
    login: body.login,
    userId: body.user_id,
    scopes: body.scopes ?? [],
    expiresIn: body.expires_in,
  };
}

/** Best effort: logging out still works locally if this request fails. */
export async function revokeToken(
  clientId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchImpl(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, token }).toString(),
    });
  } catch {
    // ignore
  }
}

export function createState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const hasScopes = (granted: readonly string[], required: readonly string[]): boolean =>
  required.every((s) => granted.includes(s));
