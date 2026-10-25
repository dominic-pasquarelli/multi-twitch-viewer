import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useServices } from '@/app/servicesContext';
import { kickLiveByLogin, withKickLive } from '@/lib/kick/liveMerge';
import type { LiveStream, TwitchUser } from '@/lib/twitch/types';
import { useAuth } from '@/state/authStore';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useSettings } from '@/state/settingsStore';

export interface FollowedChannelInfo {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

/**
 * Your followed channels that are live right now (auto-refreshing), including
 * linked ones live only on Kick (platform "kick").
 */
export function useFollowedLive() {
  const query = useTwitchFollowedLive();
  const follows = useFollowedChannels();
  const kick = useKickLive();
  const data = useMemo(() => {
    if (!query.data || !kick.size || !follows.data) return query.data;
    const names = new Map(follows.data.map((f) => [f.login, f.displayName]));
    return withKickLive(query.data, kick, names.keys(), names);
  }, [query.data, kick, follows.data]);
  return useMemo(() => ({ ...query, data }) as typeof query, [query, data]);
}

function useTwitchFollowedLive() {
  const { api } = useServices();
  const userId = useAuth((s) => s.user?.id);
  const refreshSeconds = useSettings((s) => s.refreshSeconds);
  return useQuery({
    queryKey: ['followed-live', userId],
    queryFn: () => api!.getFollowedStreams(userId!),
    enabled: !!api && !!userId,
    refetchInterval: refreshSeconds * 1000,
    // Keep polling in the background so go-live alerts still arrive.
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
  });
}

/** Every channel you follow, with avatars (refreshed every 10 minutes). */
export function useFollowedChannels() {
  const { api } = useServices();
  const userId = useAuth((s) => s.user?.id);
  return useQuery({
    queryKey: ['followed-channels', userId],
    queryFn: async (): Promise<FollowedChannelInfo[]> => {
      const follows = await api!.getFollowedChannels(userId!);
      const users = await api!.getUsersByIds(follows.map((f) => f.id));
      const byId = new Map<string, TwitchUser>(users.map((u) => [u.id, u]));
      return follows.map((f) => ({
        id: f.id,
        login: f.login,
        displayName: f.displayName,
        profileImageUrl: byId.get(f.id)?.profileImageUrl ?? '',
      }));
    },
    enabled: !!api && !!userId,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
}

/**
 * Live status of specific channels (e.g. the ones on screen that you don't
 * follow), including linked ones live only on Kick.
 */
export function useStreamsFor(logins: string[], pollInBackground = false) {
  const { api } = useServices();
  const refreshSeconds = useSettings((s) => s.refreshSeconds);
  const key = [...logins].sort();
  const query = useQuery({
    queryKey: ['streams', key],
    queryFn: () => api!.getStreamsByLogins(key),
    enabled: !!api && key.length > 0,
    refetchInterval: refreshSeconds * 1000,
    refetchIntervalInBackground: pollInBackground,
    placeholderData: keepPreviousData,
  });
  const kick = useKickLive();
  const keyId = key.join(',');
  const data = useMemo(
    () => (query.data && kick.size ? withKickLive(query.data, kick, keyId.split(',')) : query.data),
    [query.data, kick, keyId],
  );
  return useMemo(() => ({ ...query, data }) as typeof query, [query, data]);
}

/** Live status of the Kick channels you linked (needs your Kick app; see lib/kick). */
export function useKickChannels() {
  const { kickApi } = useServices();
  const refreshSeconds = useSettings((s) => s.refreshSeconds);
  const links = useChannelPrefs((s) => s.kickLinks);
  const slugs = useMemo(() => [...new Set(Object.values(links))].sort(), [links]);
  return useQuery({
    queryKey: ['kick-live', slugs],
    queryFn: () => kickApi!.getChannels(slugs),
    enabled: !!kickApi && slugs.length > 0,
    refetchInterval: refreshSeconds * 1000,
    // Like follows: keep checking in the background so go-live alerts still arrive.
    refetchIntervalInBackground: true,
    placeholderData: keepPreviousData,
  });
}

/** Linked channels live on Kick, by Twitch login. */
export function useKickLive(): ReadonlyMap<string, LiveStream> {
  const links = useChannelPrefs((s) => s.kickLinks);
  const { data } = useKickChannels();
  return useMemo(() => kickLiveByLogin(links, data ?? []), [links, data]);
}

export function useChannelSearch(query: string) {
  const { api } = useServices();
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q.toLowerCase()],
    queryFn: () => api!.searchChannels(q),
    enabled: !!api && q.length >= 2,
    staleTime: 60 * 1000,
  });
}

export function useCategorySearch(query: string) {
  const { api } = useServices();
  const q = query.trim();
  return useQuery({
    queryKey: ['category-search', q.toLowerCase()],
    queryFn: () => api!.searchCategories(q),
    enabled: !!api && q.length >= 2,
    staleTime: 60 * 1000,
  });
}

/** Explicit category browsing, with pages kept separate from followed streams. */
export function useCategoryStreams(categoryId: string) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: ['category-streams', categoryId],
    queryFn: ({ pageParam }) => api!.getStreamsByCategory(categoryId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.cursor || undefined,
    enabled: !!api && !!categoryId,
    staleTime: 60 * 1000,
  });
}

/** Profile images for history and category results, which aren't always followed. */
export function useUsersFor(logins: string[]) {
  const { api } = useServices();
  const key = [...new Set(logins)].sort();
  return useQuery({
    queryKey: ['channel-users', key],
    queryFn: () => api!.getUsersByLogins(key),
    enabled: !!api && key.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export interface LiveStatus {
  /** Live streams by login. */
  live: Map<string, LiveStream>;
  /** false until we have real data (then unknown channels are not assumed offline). */
  known: boolean;
}

/** Live status for the given channels, combining follows and direct lookups. */
export function useLiveStatus(logins: string[]): LiveStatus {
  const followed = useFollowedLive();
  const followedLogins = useMemo(
    () => new Set((followed.data ?? []).map((s) => s.login)),
    [followed.data],
  );
  // Only look up channels we can't already see in the followed-live list.
  const extra = useMemo(
    () => (followed.isSuccess ? logins.filter((l) => !followedLogins.has(l)) : logins),
    [logins, followed.isSuccess, followedLogins],
  );
  const direct = useStreamsFor(extra);

  return useMemo(() => {
    const live = new Map<string, LiveStream>();
    for (const s of followed.data ?? []) live.set(s.login, s);
    for (const s of direct.data ?? []) live.set(s.login, s);
    const known = extra.length === 0 ? followed.isSuccess : direct.isSuccess;
    return { live, known };
  }, [followed.data, followed.isSuccess, direct.data, direct.isSuccess, extra.length]);
}
