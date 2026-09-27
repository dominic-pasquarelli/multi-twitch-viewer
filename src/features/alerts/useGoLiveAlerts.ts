import { useEffect, useRef } from 'react';
import { newlyLive } from '@/lib/alerts/goLive';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useViewStore } from '@/state/viewStore';
import { useFollowedLive } from '../follows/queries';
import { notify } from './notifications';

/**
 * Watches the live-follows list and announces channels that just went live
 * (favorites only by default) with a Windows notification, or an in-app toast
 * when notifications aren't allowed. Clicking either adds the stream.
 */
export function useGoLiveAlerts(): void {
  const { data, dataUpdatedAt, isSuccess } = useFollowedLive();
  const previous = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isSuccess || !data) return;
    const mode = useSettings.getState().liveAlerts;
    const favorites = useChannelPrefs.getState().favorites;
    const onScreen = useViewStore.getState().view.channels;
    const fresh = newlyLive(previous.current, data, mode, favorites).filter(
      (s) => !onScreen.includes(s.login),
    );
    previous.current = new Set(data.map((s) => s.login));

    for (const stream of fresh) {
      const watch = () => useViewStore.getState().addChannels([stream.login]);
      const shown = notify(`${stream.displayName} is live`, {
        body: `${stream.gameName ? `${stream.gameName} · ` : ''}${stream.title}\nClick to watch`,
        tag: `live-${stream.login}`,
        onClick: watch,
      });
      if (!shown)
        toast(`${stream.displayName} just went live`, {
          action: { label: 'Watch', run: watch },
          ms: 15000,
        });
    }
  }, [data, dataUpdatedAt, isSuccess]);
}
