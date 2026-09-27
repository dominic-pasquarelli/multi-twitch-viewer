import { createJSONStorage } from 'zustand/middleware';
import { appStore, type KeyValueStore } from './keyValueStore';

/** Adapts a KeyValueStore to zustand's `persist` middleware. */
export const zustandStorage = (store: KeyValueStore = appStore) =>
  createJSONStorage(() => ({
    getItem: (name) => store.getItem(name),
    setItem: (name, value) => store.setItem(name, value),
    removeItem: (name) => store.removeItem(name),
  }));
