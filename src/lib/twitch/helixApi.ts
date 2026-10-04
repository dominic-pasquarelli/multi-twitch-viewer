import { chunk, HelixClient, type HelixClientOptions } from './helixClient';
import type {
  ChannelSearchResult,
  FollowedChannel,
  LiveStream,
  TwitchApi,
  TwitchCategory,
  TwitchUser,
} from './types';

interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

interface HelixStream {
  user_id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  type: string;
  tags?: string[];
  language?: string;
}

interface HelixFollowedChannel {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  followed_at: string;
}

interface HelixSearchChannel {
  id: string;
  broadcaster_login: string;
  display_name: string;
  is_live: boolean;
  game_name: string;
  title: string;
  thumbnail_url: string;
  tags?: string[];
  broadcaster_language?: string;
}

interface HelixCategory {
  id: string;
  name: string;
  box_art_url: string;
}

const toUser = (u: HelixUser): TwitchUser => ({
  id: u.id,
  login: u.login,
  displayName: u.display_name,
  profileImageUrl: u.profile_image_url,
});

const toStream = (s: HelixStream): LiveStream => ({
  userId: s.user_id,
  login: s.user_login,
  displayName: s.user_name,
  gameName: s.game_name,
  title: s.title,
  viewerCount: s.viewer_count,
  startedAt: s.started_at,
  thumbnailUrl: s.thumbnail_url,
  tags: s.tags ?? [],
  language: s.language ?? '',
});

/** The real Twitch API (https://dev.twitch.tv/docs/api/reference). */
export function createHelixApi(options: HelixClientOptions): TwitchApi {
  const client = new HelixClient(options);

  const usersBy = async (key: 'id' | 'login', values: string[]) => {
    const pages = await Promise.all(
      chunk(values, 100).map((part) => client.get<HelixUser>('/users', { [key]: part })),
    );
    return pages.flatMap((p) => p.data.map(toUser));
  };

  return {
    async getMe() {
      const res = await client.get<HelixUser>('/users');
      const me = res.data[0];
      if (!me) throw new Error('Twitch did not return the logged-in user');
      return toUser(me);
    },
    async getFollowedStreams(userId) {
      const streams = await client.getAll<HelixStream>('/streams/followed', { user_id: userId });
      return streams.map(toStream);
    },
    async getFollowedChannels(userId) {
      const follows = await client.getAll<HelixFollowedChannel>('/channels/followed', {
        user_id: userId,
      });
      return follows.map((f): FollowedChannel => ({
        id: f.broadcaster_id,
        login: f.broadcaster_login,
        displayName: f.broadcaster_name,
        followedAt: f.followed_at,
      }));
    },
    getUsersByIds: (ids) => (ids.length ? usersBy('id', ids) : Promise.resolve([])),
    getUsersByLogins: (logins) => (logins.length ? usersBy('login', logins) : Promise.resolve([])),
    async getStreamsByLogins(logins) {
      if (!logins.length) return [];
      const pages = await Promise.all(
        chunk(logins, 100).map((part) =>
          client.get<HelixStream>('/streams', { user_login: part, first: 100 }),
        ),
      );
      return pages.flatMap((p) => p.data.filter((s) => s.type === 'live').map(toStream));
    },
    async searchChannels(query) {
      if (!query.trim()) return [];
      const res = await client.get<HelixSearchChannel>('/search/channels', {
        query: query.trim(),
        first: 12,
      });
      return res.data.map((c): ChannelSearchResult => ({
        id: c.id,
        login: c.broadcaster_login,
        displayName: c.display_name,
        isLive: c.is_live,
        gameName: c.game_name,
        title: c.title,
        profileImageUrl: c.thumbnail_url,
        tags: c.tags ?? [],
        language: c.broadcaster_language ?? '',
      }));
    },
    async searchCategories(query) {
      if (!query.trim()) return [];
      const res = await client.get<HelixCategory>('/search/categories', {
        query: query.trim(),
        first: 20,
      });
      return res.data.map((c): TwitchCategory => ({
        id: c.id,
        name: c.name,
        boxArtUrl: c.box_art_url,
      }));
    },
    async getStreamsByCategory(categoryId, cursor) {
      if (!categoryId) return { streams: [] };
      const res = await client.get<HelixStream>('/streams', {
        game_id: categoryId,
        first: 30,
        after: cursor,
      });
      return {
        streams: res.data.filter((s) => s.type === 'live').map(toStream),
        cursor: res.pagination?.cursor,
      };
    },
  };
}
