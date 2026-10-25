import { create } from 'zustand';
import type { ViewState } from '@/lib/view/types';

/** Temporary envelopes never overwrite saved levels or listening choices. */
export const usePlaybackEffects = create<{
  listen: string | null;
  sleepGain: number;
  musicGain: number;
}>()(() => ({ listen: null, sleepGain: 1, musicGain: 1 }));

export function withTemporaryListen(view: ViewState, login: string | null): ViewState {
  if (!login || !view.channels.includes(login)) return view;
  return {
    ...view,
    audio: {
      ...view.audio,
      mode: 'mix',
      active: [...new Set([...view.audio.active, login])],
      suppressed: view.audio.suppressed?.filter((c) => c !== login),
    },
  };
}

export function temporaryScale(
  login: string,
  music: string | null,
  effects: ReturnType<typeof usePlaybackEffects.getState>,
): number {
  return (
    effects.sleepGain *
    (music === login ? effects.musicGain : 1) *
    (effects.listen && effects.listen !== login ? 0.12 : 1)
  );
}
