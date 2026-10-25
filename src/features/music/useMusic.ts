import { useEffect, useMemo } from 'react';
import { activeMusicChannel, chooseMusicChannel, withMusic } from '@/lib/music/music';
import { useMusicStore } from '@/state/musicStore';
import { useViewStore } from '@/state/viewStore';
import { useStreamsFor } from '../follows/queries';

export function useMusicStatus() {
  const channels = useMusicStore((s) => s.channels);
  const query = useStreamsFor(channels, true);
  const live = useMemo(() => new Set((query.data ?? []).map((s) => s.login)), [query.data]);
  return { live, known: query.isSuccess && !query.isPlaceholderData, error: query.isError };
}

/** One app-level selector. Polling failures never look like an offline event. */
export function useMusicStream(): void {
  const { channels, mode, current, paused, setCurrent } = useMusicStore();
  const { live, known } = useMusicStatus();
  useEffect(() => {
    if (mode !== 'auto' || paused) return;
    setCurrent(chooseMusicChannel(channels, live, known, current));
  }, [channels, mode, current, paused, live, known, setCurrent]);
}

export function usePlaybackView() {
  const view = useViewStore((s) => s.view);
  const music = useMusicStore();
  return useMemo(() => withMusic(view, music), [view, music]);
}

export const getPlaybackView = () =>
  withMusic(useViewStore.getState().view, useMusicStore.getState());
export const useMusicChannel = () => useMusicStore(activeMusicChannel);
