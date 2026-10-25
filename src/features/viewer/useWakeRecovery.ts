import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { desktop } from '@/lib/desktop/bridge';
import { markPlaybackTransition } from '@/lib/player/transitions';
import { useUi } from '@/state/uiStore';
import { useSleepTimer } from '@/state/sleepTimerStore';
import { playerRegistry } from './playerRegistry';
import { playbackRecovery } from './playbackRecovery';
import { scheduleReload, resetAutomaticReloads } from './usePlaybackRecovery';
import { WakeSignals } from './wakeSignals';

/** Repair stale sockets/decoders after waking; iframe focus alone is not a wake. */
export function useWakeRecovery() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const signals = new WakeSignals();
    let hiddenAt: number | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const recover = (reason: string, hardReset = true) => {
      const rebuildAll = hardReset || signals.pending;
      if (!signals.recover(navigator.onLine && !document.hidden && !useUi.getState().backgrounded))
        return;
      markPlaybackTransition();
      if (rebuildAll) {
        playbackRecovery.resetNetworkPressure();
        resetAutomaticReloads();
      }
      window.dispatchEvent(new Event('mtv:resume'));
      void queryClient.invalidateQueries();
      useUi.setState({
        recoveryNotice: `Playback refreshed after ${reason}. Manual pauses were preserved.`,
      });
      const timer = useSleepTimer.getState();
      const timerExpired = timer.endsAt !== null && Date.now() >= timer.endsAt;
      let index = 0;
      playerRegistry.forEach((entry, login) => {
        const shown = useUi.getState().visibleChannels;
        if (timerExpired || (shown && !shown.includes(login))) return;
        if (rebuildAll) playbackRecovery.releaseAutomaticHold(login);
        if (playbackRecovery.isManagedPause(login)) return;
        entry.controller.reapply();
        const task = setTimeout(() => {
          timers.delete(task);
          if (
            !useUi.getState().backgrounded &&
            !document.hidden &&
            navigator.onLine &&
            (!useUi.getState().visibleChannels || useUi.getState().visibleChannels!.includes(login))
          )
            scheduleReload(login);
        }, index++ * 200);
        timers.add(task);
      });
    };
    const tick = () => {
      if (
        signals.tick() ||
        (signals.pending && navigator.onLine && !document.hidden && !useUi.getState().backgrounded)
      )
        recover('a sleep or suspension');
    };
    const online = () => recover('a network reconnection', false);
    const visible = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (signals.pending || (hiddenAt !== null && Date.now() - hiddenAt >= 30_000))
        recover('returning to the app');
      hiddenAt = null;
    };
    const focus = () => {
      if (signals.pending) recover('returning to the app');
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) recover('restoring the page');
    };
    const unsubscribe = desktop?.onSystemResume?.(() => recover('a system wake or unlock'));
    const offUi = useUi.subscribe((state, previous) => {
      if (previous.backgrounded && !state.backgrounded && signals.pending)
        recover('restoring the window');
    });
    const clock = setInterval(tick, 1000);
    window.addEventListener('online', online);
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', pageshow);
    document.addEventListener('visibilitychange', visible);
    return () => {
      unsubscribe?.();
      offUi();
      clearInterval(clock);
      timers.forEach(clearTimeout);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', pageshow);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [queryClient]);
}
