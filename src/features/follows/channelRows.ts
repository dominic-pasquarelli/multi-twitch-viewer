import type { LiveStream } from '@/lib/twitch/types';

export interface ChannelRowInfo {
  login: string;
  displayName: string;
  avatar: string;
  stream?: LiveStream;
  /** A missing stream is only offline once its lookup has completed. */
  liveKnown?: boolean;
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
