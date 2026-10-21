import type { LiveStream } from '../twitch/types';
import type { KickChannel, KickLinks } from './types';

/**
 * Linked channels that are live on Kick, as live streams of their Twitch
 * login (platform "kick"), so the rest of the app treats them as live.
 */
export function kickLiveByLogin(
  links: KickLinks,
  channels: readonly KickChannel[],
): Map<string, LiveStream> {
  const bySlug = new Map(channels.map((c) => [c.slug, c]));
  const out = new Map<string, LiveStream>();
  for (const [login, slug] of Object.entries(links)) {
    const channel = bySlug.get(slug);
    if (!channel?.isLive) continue;
    out.set(login, {
      userId: '',
      login,
      displayName: login,
      gameName: channel.categoryName,
      title: channel.title,
      viewerCount: channel.viewerCount,
      startedAt: channel.startedAt,
      thumbnailUrl: channel.thumbnailUrl,
      platform: 'kick',
      kickSlug: slug,
    });
  }
  return out;
}

/**
 * Twitch live streams plus Kick ones for `logins` that aren't live on Twitch:
 * Twitch always wins, so a streamer switches back as soon as they go live there.
 * `names` gives Kick entries the channel's Twitch display name when known.
 */
export function withKickLive(
  twitch: readonly LiveStream[],
  kick: ReadonlyMap<string, LiveStream>,
  logins: Iterable<string>,
  names: ReadonlyMap<string, string> = new Map(),
): LiveStream[] {
  const onTwitch = new Set(twitch.map((s) => s.login));
  const extra: LiveStream[] = [];
  for (const login of new Set(logins)) {
    const stream = kick.get(login);
    if (!stream || onTwitch.has(login)) continue;
    extra.push({ ...stream, displayName: names.get(login) ?? stream.displayName });
  }
  return extra.length ? [...twitch, ...extra] : [...twitch];
}

/** Which player a channel uses: Kick only while it is live there and not on Twitch. */
export const kickSlugFor = (stream: LiveStream | undefined): string | null =>
  stream?.platform === 'kick' ? (stream.kickSlug ?? null) : null;
