import type { LiveStream } from '@/lib/twitch/types';

export interface ChannelRowInfo {
  login: string;
  displayName: string;
  avatar: string;
  stream?: LiveStream;
  /** A missing stream is only offline once its lookup has completed. */
  liveKnown?: boolean;
}

export type ChannelRowStatus = 'live' | 'offline' | 'checking';

/** Preserve the existing order while keeping unresolved lookups out of Offline. */
export function partitionChannelRows(rows: readonly ChannelRowInfo[]) {
  const groups: Record<ChannelRowStatus, ChannelRowInfo[]> = {
    live: [],
    offline: [],
    checking: [],
  };
  for (const row of rows) {
    const status = row.stream ? 'live' : row.liveKnown === false ? 'checking' : 'offline';
    groups[status].push(row);
  }
  return groups;
}

/** Match all query words against the metadata already loaded for this channel. */
export function matchesChannel(row: ChannelRowInfo, query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = [
    row.login,
    row.displayName,
    row.stream?.gameName,
    row.stream?.title,
    row.stream?.language,
    ...(row.stream?.tags ?? []),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}
