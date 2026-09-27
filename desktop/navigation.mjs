// @ts-check
// Which pages may load inside the app window. Everything else opens in the
// system browser, so a stray link can never take over the app.

/** @param {string} url */
export function isAllowedInApp(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === 'http:' && u.hostname === 'localhost' && u.port === '5757') return true;
  // Twitch login/consent pages (OAuth and the player sign-in for Turbo).
  return (
    u.protocol === 'https:' && (u.hostname === 'twitch.tv' || u.hostname.endsWith('.twitch.tv'))
  );
}

/** Only web links are handed to the system browser. @param {string} url */
export function isExternalWebLink(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Permissions the app (and Twitch's players) may use; everything else is denied. */
export const ALLOWED_PERMISSIONS = new Set([
  'notifications',
  'fullscreen',
  'clipboard-sanitized-write',
  'storage-access',
  'top-level-storage-access',
]);

/** Electron's user agent with its own tokens removed, so Twitch sees plain Chrome. @param {string} ua */
export const chromeUserAgent = (ua) =>
  ua.replace(/ Electron\/\S+/, '').replace(/ multi-twitch-viewer\/\S+/i, '');
