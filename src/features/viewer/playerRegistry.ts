import { desktop } from '@/lib/desktop/bridge';
import type { PlayerController } from '@/lib/player/PlayerController';
import type { PlayerAdapter } from '@/lib/player/types';
import { clearInteraction } from './playerInteraction';
import { playbackRecovery } from './playbackRecovery';
import { useViewStore } from '@/state/viewStore';
import { displayedChannels } from '@/lib/view/groups';
import { useMusicStore } from '@/state/musicStore';
import { activeMusicChannel, withMusic } from '@/lib/music/music';

export interface RegisteredPlayer {
  adapter: PlayerAdapter;
  controller: PlayerController;
}

/** Live players by channel, for app-wide actions (audio unlock, reload). */
export const playerRegistry = new Map<string, RegisteredPlayer>();

// Closing a channel ends its pause intent immediately. Embed reloads and tray
// hiding retain the channel in view state and therefore preserve its holds.
useViewStore.subscribe((state, previous) => {
  for (const login of previous.view.channels) {
    if (
      !state.view.channels.includes(login) &&
      activeMusicChannel(useMusicStore.getState()) !== login
    ) {
      playbackRecovery.forget(login);
      clearInteraction(login);
    }
  }
});

useMusicStore.subscribe((state, previous) => {
  const old = activeMusicChannel(previous);
  if (
    old &&
    old !== activeMusicChannel(state) &&
    !useViewStore.getState().view.channels.includes(old)
  ) {
    playbackRecovery.forget(old);
    clearInteraction(old);
  }
});

/**
 * Browsers only allow sound after the user interacts with the page. After the
 * first click/key press, re-apply every player's desired state so restored
 * sessions start playing audio.
 */
export function installAudioUnlock(): () => void {
  const unlock = () => {
    playerRegistry.forEach(({ controller }) => controller.reapply());
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  return unlock;
}

/** Starts every stream that is paused (or waiting for a click to autoplay). */
export function playAll(): void {
  useMusicStore.getState().setPaused(false);
  // Keyboard focus left in a player would make its pause look like yours.
  if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
  const allowed: string[] = [];
  const view = withMusic(useViewStore.getState().view, useMusicStore.getState());
  const shown = new Set(displayedChannels(view));
  for (const login of view.channels) {
    clearInteraction(login);
    playbackRecovery.setGroupHidden(login, !shown.has(login));
    playbackRecovery.allowManualPlay(login);
  }
  playerRegistry.forEach(({ adapter, controller }, login) => {
    clearInteraction(login);
    if (view.channels.includes(login)) playbackRecovery.setGroupHidden(login, !shown.has(login));
    playbackRecovery.allowManualPlay(login);
    if (playbackRecovery.isManagedPause(login)) return;
    allowed.push(login);
    adapter.play();
    controller.reapply();
  });
  desktop?.playAll?.(allowed);
}

/** Pauses every stream until an explicit play action; recovery respects the hold. */
export function pauseAll(): void {
  useMusicStore.getState().setPaused(true);
  if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
  const view = withMusic(useViewStore.getState().view, useMusicStore.getState());
  for (const login of view.channels) playbackRecovery.pauseManually(login);
  playerRegistry.forEach(({ adapter }, login) => {
    clearInteraction(login);
    playbackRecovery.pauseManually(login);
    adapter.pause();
  });
}
