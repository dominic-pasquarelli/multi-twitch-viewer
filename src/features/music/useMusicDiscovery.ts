import { useEffect } from 'react';
import { useTwitchFollowedLive } from '../follows/queries';
import { useMusicDiscovery } from '@/state/musicDiscoveryStore';
import { useAuth } from '@/state/authStore';

/** Learn from the existing followed-live poll even while the Music dialog is closed. */
export function useRememberMusicCategories() {
  const live = useTwitchFollowedLive();
  const userId = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (userId && live.isSuccess && !live.isPlaceholderData) {
      useMusicDiscovery.getState().observe(
        userId,
        live.data.map((s) => ({ id: s.userId, gameName: s.gameName })),
      );
    }
  }, [userId, live.data, live.isSuccess, live.isPlaceholderData]);
}
