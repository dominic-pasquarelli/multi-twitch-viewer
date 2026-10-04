import { describe, expect, it } from 'vitest';
import { addChannels, emptyView } from './operations';
import {
  assignGroup,
  createGroup,
  displayedChannels,
  normalizeGroups,
  removeGroup,
  replaceGroupChannel,
  streamSections,
} from './groups';
import { sanitizeView } from './validate';
import { createPreset, exportPresets, parsePresetsFile } from '../presets/presets';

const base = () => addChannels(emptyView(), ['gta1', 'gta2', 'minecraft1', 'other']);

describe('stream groups', () => {
  it('isolates tabs or clusters all streams without changing their mix', () => {
    let view = createGroup(createGroup(base(), 'GTA RP', 'gta'), 'Minecraft', 'mc');
    view = assignGroup(
      assignGroup(assignGroup(view, 'gta1', 'gta'), 'gta2', 'gta'),
      'minecraft1',
      'mc',
    );
    view = { ...view, audio: { mode: 'mix', active: ['gta1', 'minecraft1'] } };
    expect(streamSections(view).map((s) => s.channels)).toEqual([
      ['gta1', 'gta2'],
      ['minecraft1'],
      ['other'],
    ]);
    view = { ...view, activeGroup: 'gta' };
    expect(displayedChannels(view)).toEqual(['gta1', 'gta2']);
    expect(streamSections(view).map((s) => s.name)).toEqual(['GTA RP']);
    expect(view.audio.active).toEqual(['gta1', 'minecraft1']);
  });

  it('moves membership, preserves replacement slots, and removes stale channels', () => {
    let view = createGroup(createGroup(base(), 'GTA', 'gta'), 'Minecraft', 'mc');
    view = assignGroup(assignGroup(view, 'gta1', 'gta'), 'gta1', 'mc');
    expect(view.groups?.map((g) => g.channels)).toEqual([[], ['gta1']]);
    view = replaceGroupChannel(
      { ...view, channels: ['replacement', 'gta2'] },
      'gta1',
      'replacement',
    );
    expect(view.groups?.[1]?.channels).toEqual(['replacement']);
    view = normalizeGroups({ ...view, channels: ['gta2'] });
    expect(view.groups?.[1]?.channels).toEqual([]);
    view = removeGroup({ ...view, activeGroup: 'mc' }, 'mc');
    expect(view.activeGroup).toBeNull();
    expect(view.channels).toEqual(['gta2']);
  });

  it('validates imported memberships and old sessions safely', () => {
    const view = sanitizeView({
      channels: ['gta1', 'gta2'],
      activeGroup: 'missing',
      groups: [
        { id: 'gta', name: ' GTA ', channels: ['gta1', 'unknown'] },
        { id: 'mc', name: 'MC', channels: ['gta1', 'gta2'] },
        { id: 'gta', name: 'Duplicate', channels: ['gta2'] },
        { id: 'bad', name: 5, channels: [] },
      ],
    });
    expect(view?.groups).toEqual([
      { id: 'gta', name: 'GTA', channels: ['gta1'] },
      { id: 'mc', name: 'MC', channels: ['gta2'] },
    ]);
    expect(view?.activeGroup).toBeNull();
    expect(sanitizeView(base())).toEqual(base());
  });

  it('round-trips groups and the active tab through preset export/import', () => {
    const view = {
      ...assignGroup(createGroup(base(), 'GTA RP', 'gta'), 'gta1', 'gta'),
      activeGroup: 'gta',
    };
    const restored = parsePresetsFile(exportPresets([createPreset('Games', view)])).presets[0]!
      .view;
    expect(restored.groups).toEqual(view.groups);
    expect(restored.activeGroup).toBe('gta');
  });
});
