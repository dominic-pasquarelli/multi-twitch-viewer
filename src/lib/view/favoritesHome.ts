/**
 * The Favorites home view: your starred channels that are live right now,
 * plus any stream you add yourself. Favorites join when they go live and
 * leave once they have been offline for a while (see useDropOfflineStreams).
 *
 * Pure functions; the store holds whether the view is the home view and a
 * hook feeds in live status.
 */

/** Favorites that are live, in the order you starred them. */
export function liveFavorites(favorites: readonly string[], isLive: (login: string) => boolean) {
  return favorites.filter(isLive);
}

/**
 * Favorites to bring into the home view now. The first sync (`previousLive`
 * null, e.g. after a restart) brings every live favorite; later syncs only
 * the ones that went live since, so a favorite you closed stays closed until
 * it next goes live.
 */
export function favoritesToAdd(
  live: readonly string[],
  previousLive: ReadonlySet<string> | null,
  onScreen: readonly string[],
): string[] {
  return live.filter((login) => !onScreen.includes(login) && !previousLive?.has(login));
}

/**
 * Which streams in the view may be dropped once offline. In the home view
 * favorites always may; other streams follow the temporary-view rule.
 */
export function droppableWhenOffline(
  login: string,
  {
    home,
    favorites,
    temporary,
  }: { home: boolean; favorites: readonly string[]; temporary: boolean },
): boolean {
  return temporary || (home && favorites.includes(login));
}
