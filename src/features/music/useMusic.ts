import { useEffect, useMemo } from 'react';
import { activeMusicChannel, chooseMusicChannel, withMusic } from '@/lib/music/music';
import { useMusicStore } from '@/state/musicStore';
import { useViewStore } from '@/state/viewStore';
import { useStreamsFor } from '../follows/queries';
import { musicCategory } from '@/lib/music/discovery';
import { usePlaybackEffects, withTemporaryListen } from '@/state/playbackEffectsStore';

export function useMusicStatus() {
  const channels = useMusicStore((s) => s.channels);
  const query = useStreamsFor(channels, true);
  const live = useMemo(() => new Set((query.data ?? []).map((s) => s.login)), [query.data]);
  return {
    live,
    streams: query.data ?? [],
    known: query.isSuccess && !query.isPlaceholderData,
    error: query.isError,
  };
}

/** One app-level selector. Polling failures never look like an offline event. */
export function useMusicStream(): void {
  const music = useMusicStore();
  const {
    channels,
    mode,
    current,
    paused,
    setCurrent,
    musicOnly,
    keepCurrent,
    skipped,
    fadeSeconds,
  } = music;
  const { live, streams, known } = useMusicStatus();
  const eligible = musicOnly
    ? new Set(streams.filter((s) => musicCategory(s.gameName)).map((s) => s.login))
    : live;
  const desired = chooseMusicChannel(channels, eligible, known, current, { keepCurrent, skipped });
  useEffect(() => {
    if (mode !== 'auto' || paused || desired === current) return;
    if (!fadeSeconds || !current) {
      setCurrent(desired);
      return;
    }
    const start = Date.now();
    const from = usePlaybackEffects.getState().musicGain;
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / (fadeSeconds * 1000));
      usePlaybackEffects.setState({ musicGain: from * (1 - progress) });
      if (progress === 1) {
        clearInterval(timer);
        setCurrent(desired);
      }
    }, 50);
    return () => {
      clearInterval(timer);
      usePlaybackEffects.setState({ musicGain: 1 });
    };
  }, [mode, paused, desired, current, setCurrent, fadeSeconds]);

  const channel = activeMusicChannel(music);
  const fadingOut =
    mode === 'auto' && !paused && desired !== current && !!current && fadeSeconds > 0;
  useEffect(() => {
    if (fadingOut) return;
    if (!channel || !fadeSeconds || paused) {
      usePlaybackEffects.setState({ musicGain: 1 });
      return;
    }
    const start = Date.now();
    usePlaybackEffects.setState({ musicGain: 0 });
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / (fadeSeconds * 1000));
      usePlaybackEffects.setState({ musicGain: progress });
      if (progress === 1) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [channel, fadeSeconds, fadingOut, paused]);
}

export function usePlaybackView() {
  const view = useViewStore((s) => s.view);
  const music = useMusicStore();
  const listen = usePlaybackEffects((s) => s.listen);
  return useMemo(() => withTemporaryListen(withMusic(view, music), listen), [view, music, listen]);
}

export const getPlaybackView = () =>
  withTemporaryListen(
    withMusic(useViewStore.getState().view, useMusicStore.getState()),
    usePlaybackEffects.getState().listen,
  );
export const useMusicChannel = () => useMusicStore(activeMusicChannel);
