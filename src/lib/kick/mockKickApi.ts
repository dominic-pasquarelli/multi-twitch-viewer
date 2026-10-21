import type { KickApi, KickChannel } from './types';

/**
 * Fake Kick data for mock mode and tests. Channels are offline unless a test
 * (or demo) sets them live with setMockKickLive.
 */
const live = new Map<string, boolean>([['bytebard', true]]);

export function setMockKickLive(slug: string, isLive: boolean): void {
  live.set(slug.toLowerCase(), isLive);
}

export function createMockKickApi(): KickApi {
  return {
    getChannels: (slugs) =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              slugs.map((slug): KickChannel => ({
                slug,
                isLive: live.get(slug) ?? false,
                title: `${slug} on Kick`,
                categoryName: 'IRL',
                viewerCount: 321,
                startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
                thumbnailUrl: '',
              })),
            ),
          120,
        ),
      ),
  };
}
