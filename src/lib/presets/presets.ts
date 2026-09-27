import { sanitizeView, type ViewState } from '../view';

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  view: ViewState;
}

export const EXPORT_FORMAT = 'multi-twitch-viewer/presets';
export const EXPORT_VERSION = 1;

export interface PresetExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  presets: Preset[];
}

export const newPresetId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createPreset(name: string, view: ViewState, now = new Date()): Preset {
  const stamp = now.toISOString();
  return {
    id: newPresetId(),
    name: name.trim() || 'Untitled',
    createdAt: stamp,
    updatedAt: stamp,
    view,
  };
}

export function exportPresets(presets: Preset[], now = new Date()): string {
  const file: PresetExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    presets,
  };
  return JSON.stringify(file, null, 2);
}

export interface ImportResult {
  presets: Preset[];
  skipped: number;
}

/**
 * Reads an exported file. Also accepts a bare array of presets. Each preset
 * is validated on its own, so one bad entry does not block the rest.
 * Throws with a readable message if the file is not a presets export.
 */
export function parsePresetsFile(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as PresetExportFile).presets)
      ? (data as PresetExportFile).presets
      : null;
  if (!list) throw new Error('That file does not contain any presets.');

  const presets: Preset[] = [];
  let skipped = 0;
  for (const item of list as unknown[]) {
    const preset = sanitizePreset(item);
    if (preset) presets.push(preset);
    else skipped++;
  }
  return { presets, skipped };
}

export function sanitizePreset(input: unknown): Preset | null {
  if (typeof input !== 'object' || input === null) return null;
  const p = input as Record<string, unknown>;
  const view = sanitizeView(p.view);
  if (!view || typeof p.name !== 'string' || !p.name.trim()) return null;
  const date = (v: unknown) =>
    typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString();
  return {
    id: typeof p.id === 'string' && p.id ? p.id : newPresetId(),
    name: p.name.trim().slice(0, 80),
    createdAt: date(p.createdAt),
    updatedAt: date(p.updatedAt),
    view,
  };
}

/**
 * Adds imported presets to existing ones. A preset with the same id replaces
 * the existing one; a different preset with an existing name gets " (2)".
 */
export function mergePresets(existing: Preset[], incoming: Preset[]): Preset[] {
  const out = [...existing];
  for (const preset of incoming) {
    const sameId = out.findIndex((p) => p.id === preset.id);
    if (sameId >= 0) {
      out[sameId] = preset;
      continue;
    }
    let name = preset.name;
    for (let n = 2; out.some((p) => p.name === name); n++) name = `${preset.name} (${n})`;
    out.push({ ...preset, name });
  }
  return out;
}
