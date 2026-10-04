/** App-level Twitch models (decoupled from the raw Helix response shapes). */

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

export interface LiveStream {
  userId: string;
  login: string;
  displayName: string;
  gameName: string;
  /** Tags and language from Helix; available for filtering loaded streams. */
  tags?: string[];
  language?: string;
  title: string;
  viewerCount: number;
  /** ISO timestamp. */
  startedAt: string;
  /** Template with {width}/{height} placeholders. */
  thumbnailUrl: string;
}

export interface FollowedChannel {
  id: string;
  login: string;
  displayName: string;
  followedAt: string;
}

export interface ChannelSearchResult {
  id: string;
  login: string;
  displayName: string;
  isLive: boolean;
  gameName: string;
  title: string;
  profileImageUrl: string;
  tags?: string[];
  language?: string;
}

export interface TwitchCategory {
  id: string;
  name: string;
  boxArtUrl: string;
}

export interface CategoryStreamsPage {
  streams: LiveStream[];
  cursor?: string;
}

/**
 * Everything the app needs from Twitch's API. Implemented by the real Helix
 * client and by an in-memory mock (for `npm run dev:mock` and tests).
 */
export interface TwitchApi {
  getMe(): Promise<TwitchUser>;
  getFollowedStreams(userId: string): Promise<LiveStream[]>;
  getFollowedChannels(userId: string): Promise<FollowedChannel[]>;
  getUsersByIds(ids: string[]): Promise<TwitchUser[]>;
  getUsersByLogins(logins: string[]): Promise<TwitchUser[]>;
  getStreamsByLogins(logins: string[]): Promise<LiveStream[]>;
  searchChannels(query: string): Promise<ChannelSearchResult[]>;
  searchCategories(query: string): Promise<TwitchCategory[]>;
  getStreamsByCategory(categoryId: string, cursor?: string): Promise<CategoryStreamsPage>;
}

export class TwitchApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'TwitchApiError';
    this.status = status;
  }
}
