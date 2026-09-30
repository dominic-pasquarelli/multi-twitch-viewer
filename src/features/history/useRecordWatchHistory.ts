import { useEffect, useRef } from 'react';
import { useWatchHistory } from '@/state/historyStore';
import { useViewStore } from '@/state/viewStore';
import { useFollowedChannels, useLiveStatus } from '../follows/queries';

/** Logs every channel you add that you don't follow (see the sidebar's History). */
export function useRecordWatchHistory(): void {
  const channels = useViewStore((s) => s.view.channels);
  const follows = useFollowedChannels();
  const { live } = useLiveStatus(channels);
  const recorded = useRef(new Set<string>());

  useEffect(() => {
    if (!follows.isSuccess) return; // can't tell who's followed yet
    const followed = new Set(follows.data.map((f) => f.login));
    const history = useWatchHistory.getState();
    for (const login of channels) {
      if (followed.has(login)) continue;
      const name = live.get(login)?.displayName;
      if (!recorded.current.has(login)) {
        recorded.current.add(login);
        history.record(login, name ?? login);
      } else if (name && history.entries.find((e) => e.login === login)?.displayName !== name) {
        history.rename(login, name);
      }
    }
    // Re-adding a channel later counts as watching it again.
    for (const login of [...recorded.current]) {
      if (!channels.includes(login)) recorded.current.delete(login);
    }
  }, [channels, follows.isSuccess, follows.data, live]);
}
