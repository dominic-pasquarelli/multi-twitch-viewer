import type { PlayerQuality } from './types';

/**
 * Picks the lowest quality that still looks sharp at the tile's size, e.g. a
 * 360px-tall tile on a normal display gets 480p instead of 1080p60 source.
 * Returns null (let Twitch decide) when the qualities are unknown.
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
  const target = tileHeightCssPx * devicePixelRatio * 0.9;
  return (options.find((q) => q.height >= target) ?? options[options.length - 1]!).group;
}
