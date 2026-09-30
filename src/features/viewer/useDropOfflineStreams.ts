import { useEffect, useRef } from 'react';
import { OfflineTracker } from '@/lib/view/offlineTracker';
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
 */
export function useDropOfflineStreams(): void {
  const channels = useViewStore((s) => s.view.channels);
  const pinned = useViewStore((s) => s.pinned);
  const enabled = useSettings((s) => s.dropOfflineStreams);
  const liveStatus = useLiveStatus(channels);
  const tracker = useRef(new OfflineTracker());

  const latest = useRef({ channels, liveStatus, active: enabled && !pinned });
  useEffect(() => {
    latest.current = { channels, liveStatus, active: enabled && !pinned };
  });

  useEffect(() => {
    const check = () => {
      const { channels, liveStatus, active } = latest.current;
      if (!active || !liveStatus.known) return;
      tracker.current.graceMs = offlineDrop.graceMs;
      const playing = useUi.getState().playerStatus;
      const drop = tracker.current.update(
        channels,
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
  }, [channels, liveStatus, enabled, pinned]);
}
