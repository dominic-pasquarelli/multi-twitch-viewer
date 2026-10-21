import { useEffect, useMemo, useRef } from 'react';
import type { LiveStream } from '@/lib/twitch/types';
import { favoritesToAdd, liveFavorites } from '@/lib/view/favoritesHome';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { useLiveStatus } from '../follows/queries';

// Captured before useHashSync mirrors the restored view into the address bar:
// a link (or a reload) opens what it names instead of the Favorites view.
const launchedWithLink = typeof window !== 'undefined' && !!window.location.hash;

export interface LiveFavorites {
  favorites: string[];
  /** Live favorites, in the order you starred them. */
  live: string[];
  /** Live streams by login (covers every live favorite). */
  streams: ReadonlyMap<string, LiveStream>;
  /** false until live status has loaded. */
  known: boolean;
}

/** Your favorites (sidebar stars) and which of them are live right now. */
export function useLiveFavorites(): LiveFavorites {
  const favorites = useChannelPrefs((s) => s.favorites);
  const status = useLiveStatus(favorites);
  return useMemo(
    () => ({
      favorites,
      live: liveFavorites(favorites, (login) => status.live.has(login)),
      streams: status.live,
      known: status.known,
    }),
    [favorites, status],
  );
}

// What useFavoritesHome saw last, for actions outside React (shortcuts).
let latest: LiveFavorites | null = null;

/** Opens the Favorites home view with the favorites that are live now (with Undo). */
export function goHome(live: readonly string[]): void {
  useViewStore.getState().enterHome([...live]);
  toast(
    live.length
      ? `Favorites · ${live.length} live`
      : 'No favorites are live right now. They’ll appear as soon as they go live.',
    { action: { label: 'Undo', run: () => useViewStore.getState().undo() } },
  );
}

/** H key and the top-bar button: the Favorites view, or set up favorites first. */
export function openHome(): void {
  if (latest?.favorites.length) goHome(latest.live);
  else useUi.getState().openDialog('favorites');
}

/**
 * Keeps the Favorites home view current: favorites that go live join it.
 * (Leaving once offline is handled with temporary views, in
 * useDropOfflineStreams.) Also opens it at launch when that setting is on.
 */
export function useFavoritesHome(): void {
  const home = useViewStore((s) => s.home);
  const favorites = useLiveFavorites();
  const { live, known } = favorites;
  const previous = useRef<Set<string> | null>(null);
  const launch = useRef(useSettings.getState().openHomeAtLaunch && !launchedWithLink);

  useEffect(() => {
    latest = favorites;
  }, [favorites]);

  useEffect(() => {
    if (!home) previous.current = null;
  }, [home]);

  useEffect(() => {
    if (!known) return;
    const store = useViewStore.getState();
    if (launch.current) {
      launch.current = false;
      store.enterHome(live); // Undo brings back the last session
      previous.current = new Set(live);
      return;
    }
    if (!home) return;
    const add = favoritesToAdd(live, previous.current, store.view.channels);
    previous.current = new Set(live);
    if (add.length) store.addHomeChannels(add);
  }, [home, live, known]);
}
