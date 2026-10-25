import type { ChannelInformation, LiveStream } from '@/lib/twitch/types';

export type MusicCategory = 'Music' | 'DJs';
export type MusicObservations = Record<string, MusicCategory>;

export function musicCategory(name: string): MusicCategory | null {
  switch (name.trim().toLowerCase()) {
    case 'music':
      return 'Music';
    case 'djs':
      return 'DJs';
    default:
      return null;
  }
}

/** Never infer a genre from a name/title or treat stale metadata as live evidence. */
export function musicSuggestion(
  live: LiveStream | undefined,
  info: ChannelInformation | undefined,
  remembered: MusicCategory | undefined,
): string | null {
  const current = musicCategory(live?.gameName ?? info?.gameName ?? '');
  if (current) return live ? `Live in ${current}` : `Last category: ${current}`;
  return remembered ? `Previously seen in ${remembered}` : null;
}

export function sanitizeObservations(value: unknown): MusicObservations {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([id, category]) =>
          /^[a-zA-Z0-9_-]{1,80}$/.test(id) && (category === 'Music' || category === 'DJs'),
      )
      .slice(-1000),
  ) as MusicObservations;
}
