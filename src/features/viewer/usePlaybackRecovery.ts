import { useEffect, useRef, useState } from 'react';
import { desktop } from '@/lib/desktop/bridge';
import type { PlayerStatus } from '@/lib/player/types';
import { useUi } from '@/state/uiStore';
import { playerRegistry } from './playerRegistry';
import { playbackRecovery, PlayerReloadBudget } from './playbackRecovery';

export interface PlaybackRecoveryOptions {
  channels: readonly string[];
  focused: string | null;
  muted: ReadonlySet<string>;
  hidden?: ReadonlySet<string>;
  status: Readonly<Record<string, PlayerStatus>>;
}

const reloadBudget = new PlayerReloadBudget();
const pendingReloads = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleReload(login: string): boolean {
  if (
    !playerRegistry.has(login) ||
    playbackRecovery.isManagedPause(login) ||
    pendingReloads.has(login)
  )
    return false;
  const delay = reloadBudget.nextDelay(login);
  if (delay === null) return false;
  pendingReloads.set(
    login,
    setTimeout(() => {
      pendingReloads.delete(login);
      if (playerRegistry.has(login) && !playbackRecovery.isManagedPause(login))
        useUi.getState().reloadPlayer(login);
    }, delay),
  );
  return true;
}

export function usePlaybackRecovery({
  channels,
  focused,
  muted,
  hidden,
  status,
}: PlaybackRecoveryOptions) {
  const stalledSince = useRef(new Map<string, number>());
  const [recovery, setRecovery] = useState<{
    degraded: boolean;
    pausedForBandwidth: readonly string[];
  }>({
    degraded: false,
    pausedForBandwidth: [],
  });

  useEffect(() => {
    const tick = () => {
      const samples = channels.map((login) => {
        const entry = playerRegistry.get(login);
        return {
          login,
          focused: login === focused,
          muted: muted.has(login) || (entry?.adapter.getVolume() ?? 1) === 0,
          hidden: hidden?.has(login) ?? false,
          status: status[login],
          stats: entry?.adapter.getPlaybackStats?.(),
        };
      });
      const plan = playbackRecovery.plan(samples, navigator.onLine);
      for (const sample of samples) {
        const now = Date.now();
        const starving =
          navigator.onLine &&
          !sample.hidden &&
          sample.status === 'playing' &&
          !playbackRecovery.isManagedPause(sample.login) &&
          typeof sample.stats?.bufferSize === 'number' &&
          sample.stats.bufferSize <= 0.5 &&
          typeof sample.stats.fps === 'number' &&
          sample.stats.fps <= 1;
        if (starving) {
          if (!stalledSince.current.has(sample.login)) stalledSince.current.set(sample.login, now);
          // Cross-origin browser embeds cannot expose error #3000. A stream
          // that keeps starving even after shedding load gets a bounded reload.
          if (
            now - stalledSince.current.get(sample.login)! >= 30_000 &&
            scheduleReload(sample.login)
          ) {
            stalledSince.current.delete(sample.login);
          }
        } else stalledSince.current.delete(sample.login);
        playerRegistry
          .get(sample.login)
          ?.controller.setRecoveryQualityCap(plan.degraded && !sample.focused ? 360 : null);
      }
      for (const login of plan.pause) playerRegistry.get(login)?.adapter.pause();
      for (const login of plan.resume) playerRegistry.get(login)?.adapter.play();
      setRecovery((previous) =>
        previous.degraded === plan.degraded &&
        previous.pausedForBandwidth.join(',') === plan.pausedForBandwidth.join(',')
          ? previous
          : { degraded: plan.degraded, pausedForBandwidth: plan.pausedForBandwidth },
      );
    };
    // Registry effects mount after the Viewer effect, so also run next task.
    const start = setTimeout(tick, 0);
    const interval = setInterval(tick, 2000);
    window.addEventListener('online', tick);
    window.addEventListener('offline', tick);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener('online', tick);
      window.removeEventListener('offline', tick);
    };
  }, [channels, focused, muted, hidden, status]);

  useEffect(() => {
    const unsubscribe = desktop?.onPlayerError?.(({ channel, code }) => {
      if (code === 3000) scheduleReload(channel);
    });
    return () => {
      unsubscribe?.();
      pendingReloads.forEach(clearTimeout);
      pendingReloads.clear();
    };
  }, []);

  return recovery;
}
