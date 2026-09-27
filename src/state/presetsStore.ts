import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/persistence/zustandStorage';
import { createPreset, mergePresets, sanitizePreset, type Preset } from '@/lib/presets/presets';
import type { ViewState } from '@/lib/view/types';

interface PresetsStore {
  presets: Preset[];
  save(name: string, view: ViewState): Preset;
  overwrite(id: string, view: ViewState): void;
  rename(id: string, name: string): void;
  remove(id: string): void;
  importPresets(incoming: Preset[]): void;
}

export const usePresets = create<PresetsStore>()(
  persist(
    (set, get) => ({
      presets: [],
      save: (name, view) => {
        const existing = get().presets.find((p) => p.name === name.trim());
        if (existing) {
          get().overwrite(existing.id, view);
          return get().presets.find((p) => p.id === existing.id)!;
        }
        const preset = createPreset(name, structuredClone(view));
        set((s) => ({ presets: [...s.presets, preset] }));
        return preset;
      },
      overwrite: (id, view) =>
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === id
              ? { ...p, view: structuredClone(view), updatedAt: new Date().toISOString() }
              : p,
          ),
        })),
      rename: (id, name) =>
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === id && name.trim()
              ? { ...p, name: name.trim(), updatedAt: new Date().toISOString() }
              : p,
          ),
        })),
      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      importPresets: (incoming) => set((s) => ({ presets: mergePresets(s.presets, incoming) })),
    }),
    {
      name: 'presets',
      version: 1,
      storage: zustandStorage(),
      merge: (persisted, current) => {
        const raw = (persisted as { presets?: unknown } | undefined)?.presets;
        const presets = Array.isArray(raw)
          ? raw.map(sanitizePreset).filter((p): p is Preset => !!p)
          : [];
        return { ...current, presets };
      },
    },
  ),
);
