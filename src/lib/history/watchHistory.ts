/**
 * A log of channels you watched without following them, newest first, so
 * you can find them again later.
 */
export interface HistoryEntry {
  login: string;
  displayName: string;
  /** ms since epoch */
  lastWatched: number;
}

export const HISTORY_MAX = 50;

/** Adds or refreshes an entry (moving it to the top), keeping at most `max`. */
export function recordWatch(
  entries: HistoryEntry[],
  entry: HistoryEntry,
  max = HISTORY_MAX,
): HistoryEntry[] {
  const old = entries.find((e) => e.login === entry.login);
  const displayName =
    entry.displayName && entry.displayName !== entry.login
      ? entry.displayName
      : (old?.displayName ?? entry.displayName);
  return [{ ...entry, displayName }, ...entries.filter((e) => e.login !== entry.login)].slice(
    0,
    max,
  );
}

/** Updates a display name without moving the entry. */
export function renameEntry(entries: HistoryEntry[], login: string, displayName: string) {
  return entries.map((e) => (e.login === login ? { ...e, displayName } : e));
}

/** Validates stored data (drops anything malformed). */
export function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (e): e is HistoryEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as HistoryEntry).login === 'string' &&
        /^[a-z0-9_]{1,25}$/.test((e as HistoryEntry).login) &&
        typeof (e as HistoryEntry).lastWatched === 'number',
    )
    .map((e) => ({
      login: e.login,
      displayName: typeof e.displayName === 'string' && e.displayName ? e.displayName : e.login,
      lastWatched: e.lastWatched,
    }))
    .slice(0, HISTORY_MAX);
}
