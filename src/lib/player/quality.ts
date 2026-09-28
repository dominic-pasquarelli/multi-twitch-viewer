import type { PlayerQuality } from './types';

/** "Match the tile size" never goes below this: 160p/240p look smeared even small. */
export const MIN_FIT_HEIGHT = 360;

/**
 * Picks the lowest quality that still looks sharp at the tile's size, e.g. a
 * 400px-tall tile on a normal display gets 480p instead of 1080p60 source,
 * but never below 360p. Returns null (let Twitch decide) when the qualities
 * are unknown.
 */
export function pickQualityForHeight(
  qualities: PlayerQuality[],
  tileHeightCssPx: number,
  devicePixelRatio = 1,
): string | null {
  const options = qualities
    .filter((q) => q.group !== 'auto' && q.height > 0)
    .sort((a, b) => a.height - b.height);
  if (!options.length) return null;
  const target = Math.max(MIN_FIT_HEIGHT, tileHeightCssPx * devicePixelRatio * 0.9);
  return (options.find((q) => q.height >= target) ?? options[options.length - 1]!).group;
}

/**
 * What quality a stream should get:
 * - 'auto': let Twitch decide (it adapts to your connection).
 * - 'source': the best there is.
 * - 'fit': the lowest that still looks sharp at the tile's size.
 * - '720p' | '480p' | '360p' | '160p': at most that.
 */
export type QualityChoice = 'auto' | 'source' | 'fit' | '720p' | '480p' | '360p' | '160p';

export const QUALITY_CHOICES: readonly QualityChoice[] = [
  'auto',
  'source',
  'fit',
  '720p',
  '480p',
  '360p',
  '160p',
];

export const isQualityChoice = (v: unknown): v is QualityChoice =>
  QUALITY_CHOICES.includes(v as QualityChoice);

/**
 * The quality group to request for a choice, or null to let Twitch decide
 * (also when the stream's qualities aren't known yet).
 */
export function pickQuality(
  qualities: PlayerQuality[],
  choice: QualityChoice,
  tileHeightCssPx: number,
  devicePixelRatio = 1,
): string | null {
  if (choice === 'auto') return null;
  if (choice === 'fit') return pickQualityForHeight(qualities, tileHeightCssPx, devicePixelRatio);
  const options = qualities
    .filter((q) => q.group !== 'auto' && q.height > 0)
    .sort((a, b) => a.height - b.height);
  if (!options.length) return null;
  if (choice === 'source') return options[options.length - 1]!.group;
  const cap = Number.parseInt(choice, 10);
  const within = options.filter((q) => q.height <= cap);
  return (within[within.length - 1] ?? options[0]!).group;
}
