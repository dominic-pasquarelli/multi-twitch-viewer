import type { LiveStream } from '../twitch/types';

export type LiveAlertMode = 'off' | 'favorites' | 'all';

/**
 * Streams that went live since the previous poll and should raise an alert.
 * The first poll (`previous` = null) never alerts, so opening the app doesn't
 * announce everyone who is already live.
 */
export function newlyLive(
  previous: ReadonlySet<string> | null,
  current: readonly LiveStream[],
  mode: LiveAlertMode,
  favorites: readonly string[],
): LiveStream[] {
  if (!previous || mode === 'off') return [];
  return current.filter(
    (s) => !previous.has(s.login) && (mode === 'all' || favorites.includes(s.login)),
  );
}

/** Favorites first, then everyone else; each group keeps its original order. */
export function favoritesFirst<T extends { login: string }>(
  items: readonly T[],
  favorites: readonly string[],
): T[] {
  const fav = items.filter((i) => favorites.includes(i.login));
  const rest = items.filter((i) => !favorites.includes(i.login));
  return [...fav, ...rest];
}
