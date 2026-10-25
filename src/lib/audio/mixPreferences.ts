import { normalizeLogin } from '../channels/parseChannels';
import { displayedChannels } from '../view/groups';
import { focusedChannels, mainChannel } from '../view/operations';
import type { ViewState } from '../view/types';

export interface MixPreferences {
  immersive: boolean;
  enabled: boolean;
  prioritySource: 'focus' | 'manual';
  priorities: string[];
  priorityLevel: number;
  backgroundEnabled: boolean;
  backgroundLevel: number;
}

export const DEFAULT_MIX: MixPreferences = {
  immersive: false,
  enabled: false,
  prioritySource: 'focus',
  priorities: [],
  priorityLevel: 0.7,
  backgroundEnabled: false,
  backgroundLevel: 0.2,
};

export const volumePercent = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

export function sanitizeMix(input: unknown): MixPreferences {
  const p = input && typeof input === 'object' ? (input as Partial<MixPreferences>) : {};
  const level = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? volumePercent(value) : fallback;
  return {
    immersive: p.immersive === true,
    enabled: p.enabled === true,
    prioritySource: p.prioritySource === 'manual' ? 'manual' : 'focus',
    priorities: Array.isArray(p.priorities)
      ? [...new Set(p.priorities.map((c) => (typeof c === 'string' ? normalizeLogin(c) : null)))]
          .filter((c): c is string => !!c)
          .slice(0, 3)
      : [],
    priorityLevel: level(p.priorityLevel, DEFAULT_MIX.priorityLevel),
    backgroundEnabled: p.backgroundEnabled === true,
    backgroundLevel: level(p.backgroundLevel, DEFAULT_MIX.backgroundLevel),
  };
}

/** Priority is independent of mute state. A DJ always keeps its own role. */
export function mixPriorities(
  view: ViewState,
  prefs: MixPreferences,
  music: string | null,
  visibleMain?: string | null,
  visible?: readonly string[] | null,
): string[] {
  const shown = displayedChannels(view).filter(
    (c) => c !== music && (!visible || visible.includes(c)),
  );
  if (prefs.prioritySource === 'manual') return prefs.priorities.filter((c) => shown.includes(c));
  if (view.layout.mode === 'multi-focus') return focusedChannels(view, shown);
  if (view.layout.mode === 'grid') return shown.slice(0, 1);
  const main = visibleMain && shown.includes(visibleMain) ? visibleMain : mainChannel(view, shown);
  return main ? [main] : [];
}

/** Intended player output; this is a volume setting, not a measured sound level. */
export function outputPercent(
  volume: number,
  scale: number,
  output: number,
  silent: boolean,
): number {
  return silent ? 0 : Math.round(Math.min(1, Math.max(0, volume * scale * output)) * 100);
}
