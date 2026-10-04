/**
 * Remembers when you last clicked into (or typed in) each player, so the app
 * can tell a pause you made yourself from one the player made on its own.
 */
const lastInteraction = new Map<string, number>();
const interactionVersions = new Map<string, number>();

export const markInteraction = (login: string, now = Date.now()): void => {
  lastInteraction.set(login, now);
  interactionVersions.set(login, (interactionVersions.get(login) ?? 0) + 1);
};

export const interactionVersion = (login: string): number => interactionVersions.get(login) ?? 0;

export const clearInteraction = (login: string): void => {
  lastInteraction.delete(login);
};

const intentionalPauses = new Set<string>();
export const setIntentionalPause = (login: string, paused: boolean): void => {
  if (paused) intentionalPauses.add(login);
  else intentionalPauses.delete(login);
};
export const intentionallyPaused = (login: string): boolean => intentionalPauses.has(login);

export const interactedRecently = (login: string, withinMs: number, now = Date.now()): boolean =>
  now - (lastInteraction.get(login) ?? -Infinity) <= withinMs;

/** True while keyboard focus is inside this stream's player (you're using its controls). */
export function playerHasFocus(login: string): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLIFrameElement)) return false;
  return el.closest<HTMLElement>('[data-testid=player-tile]')?.dataset.channel === login;
}

/** A pause counts as yours if you were interacting with that player just before. */
export const pausedByUser = (login: string): boolean =>
  intentionallyPaused(login) || playerHasFocus(login) || interactedRecently(login, 3000);
