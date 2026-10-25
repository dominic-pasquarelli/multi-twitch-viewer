import { useEffect, useRef } from 'react';
import { newlyLive } from '@/lib/alerts/goLive';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';
import { toast } from '@/state/toastStore';
import { useViewStore } from '@/state/viewStore';
import { useFollowedLive, useKickChannels, useKickLive } from '../follows/queries';
import { kickSlugFromId } from '@/lib/channels/parseChannels';
import type { LiveStream } from '@/lib/twitch/types';
import { notify } from './notifications';

/**
 * Watches the live-follows list and announces channels that just went live
 * (favorites only by default) with a Windows notification, or an in-app toast
 * when notifications aren't allowed. Clicking either adds the stream.
 */
export function useGoLiveAlerts(): void {
  const { data, dataUpdatedAt, isSuccess } = useFollowedLive();
  const kick = useKickChannels();
  const kickLive = useKickLive();
  const previous = useRef<Set<string> | null>(null);
  const previousKick = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isSuccess || !data) return;
    const mode = useSettings.getState().liveAlerts;
    const favorites = useChannelPrefs.getState().favorites;
    const onScreen = useViewStore.getState().view.channels;
    const fresh = newlyLive(previous.current, data, mode, favorites).filter(
      (s) => !onScreen.includes(s.login),
    );
    previous.current = new Set(data.map((s) => s.login));

    fresh.forEach(announce);
  }, [data, dataUpdatedAt, isSuccess]);

  useEffect(() => {
    if (!kick.isSuccess || kick.isPlaceholderData) return;
    const streams = [...kickLive.values()].filter((s) => !!kickSlugFromId(s.login));
    const mode = useSettings.getState().liveAlerts;
    const favorites = useChannelPrefs.getState().favorites;
    const onScreen = useViewStore.getState().view.channels;
    // Kick favorites are explicit subscriptions; watched/history channels alone
    // must not generate the "everyone I follow" alerts intended for Twitch.
    const fresh = newlyLive(
      previousKick.current,
      streams,
      mode === 'off' ? 'off' : 'favorites',
      favorites,
    );
    previousKick.current = new Set(streams.map((s) => s.login));
    fresh.filter((s) => !onScreen.includes(s.login)).forEach(announce);
  }, [kick.isSuccess, kick.isPlaceholderData, kick.dataUpdatedAt, kickLive]);
}

function announce(stream: LiveStream) {
  const watch = () => useViewStore.getState().addChannels([stream.login]);
  const where = stream.platform === 'kick' ? ' on Kick' : '';
  const shown = notify(`${stream.displayName} is live${where}`, {
    body: `${stream.gameName ? `${stream.gameName} · ` : ''}${stream.title}\nClick to watch`,
    tag: `live-${stream.login}`,
    onClick: watch,
  });
  if (!shown)
    toast(`${stream.displayName} just went live${where}`, {
      action: { label: 'Watch', run: watch },
      ms: 15000,
    });
}
