import { useEffect } from 'react';
import { sleepGain, useSleepTimer } from '@/state/sleepTimerStore';
import { usePlaybackEffects } from '@/state/playbackEffectsStore';
import { pauseAll } from '../viewer/playerRegistry';

export function useSleepTimerPlayback() {
  const { endsAt, fadeSeconds } = useSleepTimer();
  useEffect(() => {
    if (endsAt === null) {
      usePlaybackEffects.setState({ sleepGain: 1 });
      return;
    }
    const tick = () => {
      const gain = sleepGain(endsAt, fadeSeconds, Date.now());
      usePlaybackEffects.setState({ sleepGain: gain });
      if (Date.now() >= endsAt) {
        pauseAll();
        useSleepTimer.setState({ endsAt: null, finished: true });
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [endsAt, fadeSeconds]);
}
