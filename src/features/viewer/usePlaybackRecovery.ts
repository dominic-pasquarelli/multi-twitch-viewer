import { useEffect, useRef, useState } from 'react';
import { desktop } from '@/lib/desktop/bridge';
import type { PlayerStatus } from '@/lib/player/types';
import { useUi } from '@/state/uiStore';
import { playerRegistry } from './playerRegistry';
import { playbackRecovery, PlayerReloadBudget } from './playbackRecovery';
import { selectedRecently } from './playerInteraction';
import { markNativePlayerInput } from '@/lib/player/transitions';

export interface PlaybackRecoveryOptions {
  channels: readonly string[];
  focused: ReadonlySet<string>;
  muted: ReadonlySet<string>;
  hidden?: ReadonlySet<string>;
  bandwidthSaving?: boolean;
  status: Readonly<Record<string, PlayerStatus>>;
}

const reloadBudget = new PlayerReloadBudget();
const pendingReloads = new Map<string, ReturnType<typeof setTimeout>>();

export function resetAutomaticReloads() {
  pendingReloads.forEach(clearTimeout);
  pendingReloads.clear();
  reloadBudget.reset();
}

export function cancelPendingReload(login: string) {
  const timer = pendingReloads.get(login);
  if (timer) clearTimeout(timer);
  pendingReloads.delete(login);
}

export function scheduleReload(login: string): boolean {
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
  bandwidthSaving = true,
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
          focused: focused.has(login),
          muted: muted.has(login) || (entry?.adapter.getVolume() ?? 1) === 0,
          hidden: hidden?.has(login) ?? false,
          status: status[login],
          stats: entry?.adapter.getPlaybackStats?.(),
        };
      });
      const plan = playbackRecovery.plan(samples, navigator.onLine, bandwidthSaving);
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
          // that keeps starving gets a bounded reload, independently of the
          // automatic bandwidth-saving preference.
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
  }, [channels, focused, muted, hidden, status, bandwidthSaving]);

  useEffect(() => {
    const onIntent = (event: MessageEvent) => {
      if (
        event.origin !== 'https://player.twitch.tv' ||
        !['mtv:playback-intent', 'mtv:player-interaction'].includes(event.data?.type)
      )
        return;
      const frame = [
        ...document.querySelectorAll<HTMLIFrameElement>('[data-player-host] iframe'),
      ].find((f) => f.contentWindow === event.source);
      const login = frame?.closest<HTMLElement>('[data-testid=player-tile]')?.dataset.channel;
      if (!login) return;
      markNativePlayerInput(login);
      if (
        event.data.type === 'mtv:player-interaction' ||
        typeof event.data.paused !== 'boolean' ||
        (event.data.paused && selectedRecently(login))
      )
        return;
      const entry = playerRegistry.get(login);
      if (event.data.paused) {
        playbackRecovery.pauseManually(login);
        entry?.adapter.pause();
      } else {
        playbackRecovery.allowManualPlay(login);
        entry?.adapter.play();
        entry?.controller.reapply();
      }
    };
    window.addEventListener('message', onIntent);
    return () => window.removeEventListener('message', onIntent);
  }, []);

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
