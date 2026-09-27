import { useEffect } from 'react';
import { useUi } from '@/state/uiStore';

export async function toggleFullscreen(): Promise<void> {
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
    const sync = () => useUi.getState().setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
}
