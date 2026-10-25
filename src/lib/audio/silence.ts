/** Silence implied by settings, independent of playback/offline state. */
export function silenceReason(
  muted: boolean,
  volume: number | null,
  scale: number,
  supportsVolume = true,
): string | null {
  if (muted) return 'Audio muted';
  if (!supportsVolume) return null;
  if (volume === 0) return 'Stream volume is 0%';
  if (scale === 0) return 'Output level is 0%';
  return null;
}
