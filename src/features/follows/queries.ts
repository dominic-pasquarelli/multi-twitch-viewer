import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useServices } from '@/app/servicesContext';
import type { LiveStream, TwitchUser } from '@/lib/twitch/types';
import { useAuth } from '@/state/authStore';
import { useSettings } from '@/state/settingsStore';

export interface FollowedChannelInfo {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

/** Your followed channels that are live right now (auto-refreshing). */
export function useFollowedLive() {
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

/** Live status of specific channels (e.g. the ones on screen that you don't follow). */
export function useStreamsFor(logins: string[]) {
  const { api } = useServices();
  const refreshSeconds = useSettings((s) => s.refreshSeconds);
  const key = [...logins].sort();
  return useQuery({
    queryKey: ['streams', key],
    queryFn: () => api!.getStreamsByLogins(key),
    enabled: !!api && key.length > 0,
    refetchInterval: refreshSeconds * 1000,
    placeholderData: keepPreviousData,
  });
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
