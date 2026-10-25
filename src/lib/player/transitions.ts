let settlingUntil = 0;
const nativeInput = new Map<string, number>();

/** Player resize/quality/mute messages may arrive after a layout or audio change. */
export const markPlaybackTransition = (now = Date.now()): void => {
  settlingUntil = now + 3500;
};
export const playbackTransitionActive = (now = Date.now()): boolean => now < settlingUntil;
export const markNativePlayerInput = (login: string): void => {
  nativeInput.set(login, Date.now());
};
export const nativePlayerInputRecent = (login: string): boolean =>
  Date.now() - (nativeInput.get(login) ?? -Infinity) < 3000;
