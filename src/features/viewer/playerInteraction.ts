/**
 * Remembers when you last clicked into (or typed in) each player, so the app
 * can tell a pause you made yourself from one the player made on its own.
 */
const lastInteraction = new Map<string, number>();
const interactionVersions = new Map<string, number>();
const selections = new Map<string, { at: number; version: number }>();

export const markInteraction = (login: string, now = Date.now()): void => {
  lastInteraction.set(login, now);
  interactionVersions.set(login, (interactionVersions.get(login) ?? 0) + 1);
};

export const interactionVersion = (login: string): number => interactionVersions.get(login) ?? 0;

export const clearInteraction = (login: string): void => {
  lastInteraction.delete(login);
  selections.delete(login);
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

/**
 * Clicking a stream to make it the main (or heard) one also reaches Twitch's
 * player, which toggles pause on click, sometimes several hundred ms later.
 * A pause soon after such a selection is a side effect of the click, not a
 * request, and the window also covers the re-buffer as the stream switches
 * quality. Your next click into that player ends it.
 */
export const SELECTION_GRACE_MS = 3000;

export const markSelection = (login: string, now = Date.now()): void => {
  selections.set(login, { at: now, version: interactionVersion(login) });
};

export const selectedRecently = (login: string, now = Date.now()): boolean => {
  const selection = selections.get(login);
  return (
    !!selection &&
    selection.version === interactionVersion(login) &&
    now - selection.at <= SELECTION_GRACE_MS
  );
};

/**
 * A pause counts as yours if you were interacting with that player just
 * before, unless that interaction was the click that selected it.
 */
export const pausedByUser = (login: string): boolean =>
  intentionallyPaused(login) ||
  (!selectedRecently(login) && (playerHasFocus(login) || interactedRecently(login, 3000)));
