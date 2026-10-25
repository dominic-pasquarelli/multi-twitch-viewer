import { useEffect, useRef } from 'react';
import { droppableWhenOffline } from '@/lib/view/favoritesHome';
import { OfflineTracker } from '@/lib/view/offlineTracker';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useUi } from '@/state/uiStore';
import { useViewStore } from '@/state/viewStore';
import { useLiveStatus } from '../follows/queries';

/** How long a stream must stay offline before a temporary view drops it. */
export const offlineDrop = { graceMs: 90_000 };

/**
 * Temporary views (anything not loaded from a preset): streams that were live
 * and then stay offline are removed, with Undo. Kept (preset) views and the
 * "Remove streams that go offline" setting turned off leave them in place.
 * The Favorites home view always lets its favorites go once they're offline.
 */
export function useDropOfflineStreams(): void {
  const channels = useViewStore((s) => s.view.channels);
  const pinned = useViewStore((s) => s.pinned);
  const home = useViewStore((s) => s.home);
  const favorites = useChannelPrefs((s) => s.favorites);
  const enabled = useSettings((s) => s.dropOfflineStreams);
  const liveStatus = useLiveStatus(channels);
  const tracker = useRef(new OfflineTracker());
  const resumeGraceUntil = useRef(0);
  const lastChecked = useRef<number | null>(null);

  const rules = { home, favorites, temporary: enabled && !pinned };
  const latest = useRef({ channels, liveStatus, rules });
  useEffect(() => {
    latest.current = { channels, liveStatus, rules };
  });

  useEffect(() => {
    const onResume = () => {
      tracker.current = new OfflineTracker();
      resumeGraceUntil.current = Date.now() + 15_000;
    };
    window.addEventListener('mtv:resume', onResume);
    return () => window.removeEventListener('mtv:resume', onResume);
  }, []);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      if (lastChecked.current !== null && now - lastChecked.current >= 30_000) {
        tracker.current = new OfflineTracker();
        resumeGraceUntil.current = now + 15_000;
      }
      lastChecked.current = now;
      if (now < resumeGraceUntil.current) return;
      const { channels, liveStatus, rules } = latest.current;
      if (!liveStatus.known) return;
      tracker.current.graceMs = offlineDrop.graceMs;
      const playing = useUi.getState().playerStatus;
      // Streams that may not be dropped are left out, so the tracker forgets them.
      const drop = tracker.current.update(
        channels.filter((login) => droppableWhenOffline(login, rules)),
        (login) => liveStatus.live.has(login) || playing[login] === 'playing',
      );
      if (!drop.length) return;
      useViewStore.getState().removeChannels(drop);
      toast(`${drop.join(', ')} went offline and ${drop.length === 1 ? 'was' : 'were'} removed`, {
        action: { label: 'Undo', run: () => useViewStore.getState().undo() },
      });
    };
    check();
    const timer = setInterval(check, 5_000);
    return () => clearInterval(timer);
  }, [channels, liveStatus, enabled, pinned, home, favorites]);
}
