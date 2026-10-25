import { normalizeChannel } from '@/lib/channels/parseChannels';
import { sanitizeMix } from '@/lib/audio/mixPreferences';
import { sanitizeMusic } from '@/lib/music/music';
import { isQualityChoice } from '@/lib/player/quality';
import { DEFAULT_SETTINGS, isMutedHighlights, type Settings } from '@/state/settingsStore';

export type PortableSettings = Omit<Settings, 'clientId' | 'kickClientId' | 'kickClientSecret'>;
export const record = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
export const level = (v: unknown, fallback: number, max = 1): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback;
export const channels = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((c): c is string => typeof c === 'string')
            .map(normalizeChannel)
            .filter((c): c is string => !!c),
        ),
      ].slice(0, 5000)
    : [];
export const levels = (v: unknown, max = 1): Record<string, number> =>
  Object.fromEntries(
    Object.entries(record(v))
      .filter(
        ([key, value]) =>
          normalizeChannel(key) === key && typeof value === 'number' && Number.isFinite(value),
      )
      .slice(0, 5000)
      .map(([key, value]) => [key, level(value, 0, max)]),
  );

export function sanitizeSettings(input: unknown): PortableSettings {
  const p = record(input);
  const {
    clientId: _client,
    kickClientId: _kick,
    kickClientSecret: _secret,
    ...defaults
  } = DEFAULT_SETTINGS;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof PortableSettings)[]) {
    if (typeof defaults[key] === 'boolean' && typeof p[key] === 'boolean')
      Object.assign(result, { [key]: p[key] });
  }
  result.tileGap = Math.round(level(p.tileGap, defaults.tileGap, 12));
  result.refreshSeconds = Math.max(
    15,
    Math.round(level(p.refreshSeconds, defaults.refreshSeconds, 600)),
  );
  result.duckLevel = level(p.duckLevel, defaults.duckLevel);
  if (isMutedHighlights(p.mutedHighlights)) result.mutedHighlights = p.mutedHighlights;
  if (isQualityChoice(p.mainQuality)) result.mainQuality = p.mainQuality;
  if (isQualityChoice(p.otherQuality)) result.otherQuality = p.otherQuality;
  if (p.sidebarSort === 'viewers' || p.sidebarSort === 'name' || p.sidebarSort === 'uptime')
    result.sidebarSort = p.sidebarSort;
  if (p.liveAlerts === 'favorites' || p.liveAlerts === 'all' || p.liveAlerts === 'off')
    result.liveAlerts = p.liveAlerts;
  return result;
}

export function sanitizeAudio(input: unknown) {
  const p = record(input);
  return {
    volumes: levels(p.volumes),
    balance: levels(p.balance, 4),
    master: level(p.master, 0.5),
    mainLevel: level(p.mainLevel, 1),
    output: level(p.output, 1),
  };
}

const sceneKeys = [
  'tileGap',
  'audioFollowsMain',
  'chatFollowsAudio',
  'mainQuality',
  'otherQuality',
  'consistentVolume',
  'mainPriority',
  'duckLevel',
] as const;
export type SceneSettings = Pick<Settings, (typeof sceneKeys)[number]>;
export function sceneSettings(input: unknown): SceneSettings {
  const settings = sanitizeSettings(input);
  return Object.fromEntries(sceneKeys.map((key) => [key, settings[key]])) as SceneSettings;
}
export function sanitizeScene(input: unknown) {
  const p = record(input);
  return {
    music: sanitizeMusic(p.music),
    mix: sanitizeMix(p.mix),
    audio: sanitizeAudio(p.audio),
    settings: sceneSettings(p.settings),
  };
}
export type ScenePreferences = ReturnType<typeof sanitizeScene>;
