import { describe, expect, it } from 'vitest';
import { addChannels, emptyView } from '../view';
import { createPreset, exportPresets, mergePresets, parsePresetsFile } from './presets';

const view = addChannels(emptyView(), ['a', 'b']);

describe('presets', () => {
  it('round-trips through export/import', () => {
    const p = createPreset('  Friday squad ', view, new Date('2026-01-01T00:00:00Z'));
    expect(p.name).toBe('Friday squad');
    const { presets, skipped } = parsePresetsFile(exportPresets([p]));
    expect(skipped).toBe(0);
    expect(presets).toEqual([p]);
  });

  it('skips invalid entries but keeps valid ones', () => {
    const good = createPreset('ok', view);
    const text = JSON.stringify([good, { name: 'no view' }, { view: { channels: ['x'] } }]);
    const res = parsePresetsFile(text);
    expect(res.presets.map((p) => p.name)).toEqual(['ok']);
    expect(res.skipped).toBe(2);
  });

  it('gives readable errors', () => {
    expect(() => parsePresetsFile('{nope')).toThrow('not valid JSON');
    expect(() => parsePresetsFile('{"a":1}')).toThrow('does not contain any presets');
  });

  it('merges: same id replaces, same name gets a suffix', () => {
    const a = createPreset('A', view);
    const a2 = { ...a, name: 'A renamed' };
    const other = createPreset('A', view);
    const merged = mergePresets([a], [a2, other]);
    expect(merged.map((p) => p.name)).toEqual(['A renamed', 'A']);
    expect(mergePresets(merged, [createPreset('A', view)]).map((p) => p.name)).toEqual([
      'A renamed',
      'A',
      'A (2)',
    ]);
  });
});
