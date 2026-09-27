import { useEffect } from 'react';
import { hashToView, viewToHash } from '@/lib/view/urlHash';
import { useViewStore } from '@/state/viewStore';

/**
 * Keeps the address bar in sync with what you're watching
 * (http://localhost:5757/#/chan1/chan2), so browser bookmarks work like
 * multitwitch links. Opening such a link loads those channels.
 */
export function useHashSync(): void {
  useEffect(() => {
    const applyHash = () => {
      const fromHash = hashToView(window.location.hash);
      if (!fromHash) return;
      const store = useViewStore.getState();
      const current = store.view;
      if (viewToHash(current) === window.location.hash) return;
      store.watchOnly(fromHash.channels);
      if (fromHash.mode === 'focus') {
        if (fromHash.main) store.setMain(fromHash.main);
        else store.setLayoutMode('focus');
      }
    };
    applyHash();
    // Restored session with a clean URL: show it in the address bar too.
    if (!window.location.hash) {
      const hash = viewToHash(useViewStore.getState().view);
      if (hash) window.history.replaceState(null, '', hash);
    }
    window.addEventListener('hashchange', applyHash);

    const unsubscribe = useViewStore.subscribe((s, prev) => {
      if (s.view === prev.view) return;
      const hash = viewToHash(s.view);
      if (hash !== window.location.hash) {
        window.history.replaceState(
          null,
          '',
          hash || window.location.pathname + window.location.search,
        );
      }
    });
    return () => {
      window.removeEventListener('hashchange', applyHash);
      unsubscribe();
    };
  }, []);
}
