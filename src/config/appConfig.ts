/** Build-time configuration (see .env.example). */
export const IS_MOCK = import.meta.env.VITE_TWITCH_MOCK === 'true';
export const ENV_CLIENT_ID = (import.meta.env.VITE_TWITCH_CLIENT_ID ?? '').trim();

/** The exact URL to register as "OAuth Redirect URL" in the Twitch console. */
export const redirectUri = (): string => window.location.origin;

export const TWITCH_CONSOLE_URL = 'https://dev.twitch.tv/console/apps/create';

/** Where to create the Kick app used for linked channels' live status. */
export const KICK_DEVELOPER_URL = 'https://kick.com/settings/developer';
