import { markPlaybackTransition } from '@/lib/player/transitions';
import { usePlaybackEffects } from '@/state/playbackEffectsStore';
import { useUi } from '@/state/uiStore';
import { getPlaybackView } from '../music/useMusic';
import { displayedChannels } from '@/lib/view/groups';
import { playerRegistry } from './playerRegistry';
import { playbackRecovery } from './playbackRecovery';
import { cancelPendingReload } from './usePlaybackRecovery';

let pending: ReturnType<typeof setTimeout>[] = [];

/** Explicit repair recreates embeds, retaining the scene, volumes and manual pause holds. */
export function repairVisiblePlayback(): number {
  pending.forEach(clearTimeout);
  pending = [];
  usePlaybackEffects.setState({ listen: null });
  markPlaybackTransition();
  const channels = useUi.getState().visibleChannels ?? displayedChannels(getPlaybackView());
  channels.forEach((login, index) => {
    cancelPendingReload(login);
    pending.push(
      setTimeout(() => {
        const ui = useUi.getState();
        if (
          !ui.backgrounded &&
          playerRegistry.has(login) &&
          (!ui.visibleChannels || ui.visibleChannels.includes(login))
        ) {
          playbackRecovery.releaseAutomaticHold(login);
          ui.reloadPlayer(login);
        }
      }, index * 400),
    );
  });
  return channels.length;
}
