import { useEffect } from 'react';
import { useUi } from '@/state/uiStore';
import { markPlaybackTransition } from '@/lib/player/transitions';

export async function toggleFullscreen(): Promise<void> {
  markPlaybackTransition();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    // Browsers may refuse (e.g. not triggered by a user action); ignore.
  }
}

/** Mirrors the browser's fullscreen state into the UI store. */
export function useFullscreenSync(): void {
  useEffect(() => {
    const sync = () => {
      markPlaybackTransition();
      useUi.getState().setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
}
