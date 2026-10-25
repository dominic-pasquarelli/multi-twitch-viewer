import { useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/servicesContext';
import { toast } from '@/state/toastStore';
import { useFollowedChannels } from './queries';
import { isValidLogin } from '@/lib/channels/parseChannels';

/**
 * Following needs Twitch itself (its API no longer lets apps follow for you):
 * this opens the channel's Twitch page to click Follow, then refreshes your
 * followed list.
 */
export function useFollowChannel() {
  const { openFollowPage } = useServices();
  const queryClient = useQueryClient();
  const follows = useFollowedChannels();
  const followed = new Set((follows.data ?? []).map((f) => f.login));

  const follow = async (login: string) => {
    if (!isValidLogin(login)) return;
    await openFollowPage(login);
    await queryClient.invalidateQueries({ queryKey: ['followed-channels'] });
    await queryClient.invalidateQueries({ queryKey: ['followed-live'] });
    const now = queryClient
      .getQueriesData<{ login: string }[]>({ queryKey: ['followed-channels'] })
      .some(([, data]) => data?.some((f) => f.login === login));
    if (now) toast(`You follow ${login} now`);
  };

  return {
    /** Known (follow list loaded) and not followed. */
    canFollow: (login: string) => isValidLogin(login) && follows.isSuccess && !followed.has(login),
    follow,
  };
}
