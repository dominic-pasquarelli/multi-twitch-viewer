import type { PlayerController } from '@/lib/player/PlayerController';
import type { PlayerAdapter } from '@/lib/player/types';

export interface RegisteredPlayer {
  adapter: PlayerAdapter;
  controller: PlayerController;
}

/** Live players by channel, for app-wide actions (audio unlock, reload). */
export const playerRegistry = new Map<string, RegisteredPlayer>();

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
  // Keyboard focus left in a player would make its pause look like yours.
  if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
  playerRegistry.forEach(({ adapter, controller }) => {
    adapter.play();
    controller.reapply();
  });
}
