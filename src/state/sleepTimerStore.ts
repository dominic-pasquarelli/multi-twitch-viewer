import { create } from 'zustand';

export const sleepGain = (endsAt: number, fadeSeconds: number, now: number): number =>
  now >= endsAt ? 0 : fadeSeconds <= 0 ? 1 : Math.min(1, (endsAt - now) / (fadeSeconds * 1000));

export const useSleepTimer = create<{
  endsAt: number | null;
  fadeSeconds: number;
  finished: boolean;
  start(minutes: number, fadeSeconds: number): void;
  cancel(): void;
}>()((set) => ({
  endsAt: null,
  fadeSeconds: 30,
  finished: false,
  start: (minutes, fadeSeconds) => {
    if (!Number.isFinite(minutes) || !Number.isFinite(fadeSeconds) || minutes < 1 || minutes > 720)
      return;
    set({
      endsAt: Date.now() + minutes * 60_000,
      fadeSeconds: Math.max(0, Math.min(minutes * 60, fadeSeconds)),
      finished: false,
    });
  },
  cancel: () => set({ endsAt: null, finished: false }),
}));
