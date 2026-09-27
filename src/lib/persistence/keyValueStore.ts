/**
 * Minimal string key/value storage. Everything the app persists goes through
 * this interface, so the backing store can be swapped (browser storage today,
 * a file or a sync service later) without touching the features.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * Browser localStorage, falling back to memory when it is unavailable
 * (private windows with storage blocked, quota errors).
 */
export function createBrowserStore(prefix = 'mtv:'): KeyValueStore {
  const fallback = createMemoryStore();
  const storage = (() => {
    try {
      const s = window.localStorage;
      const probe = `${prefix}__probe`;
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch {
      return null;
    }
  })();
  if (!storage) return fallback;
  return {
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => {
      try {
        storage.setItem(prefix + key, value);
      } catch (err) {
        console.warn('[storage] could not save', key, err);
      }
    },
    removeItem: (key) => storage.removeItem(prefix + key),
  };
}

export const appStore: KeyValueStore =
  typeof window === 'undefined' ? createMemoryStore() : createBrowserStore();
