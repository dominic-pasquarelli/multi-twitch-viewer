import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT_OPTIONS, type Size } from '@/lib/layout';
import type { ViewState } from '@/lib/view/types';
import { streamSections } from '@/lib/view/groups';
import { addChannels, emptyView, setMain } from '@/lib/view/operations';
import { computeGroupedLayout, SECTION_LABEL_HEIGHT } from './groupedLayout';

function expectGeometry(view: ViewState, size: Size) {
  const layout = computeGroupedLayout(view, streamSections(view), size, DEFAULT_LAYOUT_OPTIONS);
  const shown = streamSections(view).flatMap((section) => section.channels);
  expect([...layout.tiles.keys()].sort()).toEqual([...shown].sort());
  expect(new Set(layout.order).size).toBe(shown.length);
  expect(layout.rects).toEqual(layout.order.map((channel) => layout.tiles.get(channel)));
  for (const rect of layout.rects) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.y).toBeGreaterThanOrEqual(-1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(size.height + 1);
    expect(Math.abs(rect.height - rect.width / DEFAULT_LAYOUT_OPTIONS.aspect)).toBeLessThanOrEqual(
      1,
    );
  }
  const regions = [...layout.sections, ...(layout.focused ? [layout.focused] : [])];
  regions.forEach(({ rect: a }, i) =>
    regions.slice(i + 1).forEach(({ rect: b }) => {
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX <= 1 || overlapY <= 1).toBe(true);
    }),
  );
  for (const section of layout.sections) {
    for (const channel of section.channels) {
      const tile = layout.tiles.get(channel)!;
      expect(tile.x).toBeGreaterThanOrEqual(section.rect.x - 1);
      expect(tile.y).toBeGreaterThanOrEqual(section.rect.y + SECTION_LABEL_HEIGHT - 1);
      expect(tile.x + tile.width).toBeLessThanOrEqual(section.rect.x + section.rect.width + 1);
      expect(tile.y + tile.height).toBeLessThanOrEqual(section.rect.y + section.rect.height + 1);
    }
  }
  if (layout.focused) {
    const main = layout.tiles.get(layout.focused.channel)!;
    expect(main.y).toBe(layout.focused.rect.y + SECTION_LABEL_HEIGHT);
    expect(layout.order[0]).toBe(layout.focused.channel);
    for (const [channel, rect] of layout.tiles) {
      if (channel !== layout.focused.channel) expect(main.width).toBeGreaterThan(rect.width);
    }
  }
  layout.rects.forEach((a, i) =>
    layout.rects.slice(i + 1).forEach((b) => {
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX <= 1 || overlapY <= 1).toBe(true);
    }),
  );
  return layout;
}

describe('grouped viewer geometry', () => {
  const view = {
    ...addChannels(emptyView(), ['a', 'b', 'c', 'd', 'e']),
    groups: [
      { id: 'gta', name: 'GTA', channels: ['a', 'b', 'c'] },
      { id: 'minecraft', name: 'Minecraft', channels: ['d', 'e'] },
    ],
  };
  it.each([
    { width: 1800, height: 900 },
    { width: 800, height: 1100 },
  ])('keeps every tile inside its labeled section at %j', (size) => {
    const layout = computeGroupedLayout(view, streamSections(view), size, DEFAULT_LAYOUT_OPTIONS);
    expect(layout.tiles.size).toBe(5);
    for (const section of layout.sections) {
      for (const channel of section.channels) {
        const rect = layout.tiles.get(channel)!;
        expect(rect.x).toBeGreaterThanOrEqual(section.rect.x - 1);
        expect(rect.y).toBeGreaterThanOrEqual(section.rect.y + 23);
        expect(rect.x + rect.width).toBeLessThanOrEqual(section.rect.x + section.rect.width + 1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(section.rect.y + section.rect.height + 1);
      }
    }
    const rects = layout.rects;
    rects.forEach((a, i) =>
      rects.slice(i + 1).forEach((b) => {
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(overlapX <= 1 || overlapY <= 1).toBe(true);
      }),
    );
  });
  it('focuses one stream across groups and isolated tabs use only their members', () => {
    const focused = setMain(view, 'b');
    const all = computeGroupedLayout(
      focused,
      streamSections(focused),
      { width: 1800, height: 900 },
      DEFAULT_LAYOUT_OPTIONS,
    );
    expect(all.focused?.channel).toBe('b');
    expect(all.tiles.get('b')!.width).toBeGreaterThan(all.tiles.get('a')!.width);
    expect(all.tiles.get('b')!.width).toBeGreaterThan(all.tiles.get('d')!.width);
    expect(all.sections.find((section) => section.id === 'gta')?.channels).toEqual(['a', 'c']);
    const selected = { ...focused, activeGroup: 'minecraft' };
    const single = computeGroupedLayout(
      selected,
      streamSections(selected),
      { width: 1800, height: 900 },
      DEFAULT_LAYOUT_OPTIONS,
    );
    expect([...single.tiles.keys()]).toEqual(['d', 'e']);
    expect(single.tiles.get('d')!.width).toBeGreaterThan(single.tiles.get('e')!.width);
  });

  it.each(['a', 'c', 'd', 'e'])(
    'keeps the focus on %s authoritative across first and last groups',
    (main) => {
      for (const size of [
        { width: 1800, height: 900 },
        { width: 480, height: 780 },
      ]) {
        const layout = expectGeometry(setMain(view, main), size);
        expect(layout.focused?.channel).toBe(main);
        expect(layout.sections.every((section) => !section.channels.includes(main))).toBe(true);
      }
    },
  );

  it('uses shown view order for fallback and gives an ungrouped focus its own label', () => {
    const ungrouped = {
      ...view,
      channels: ['u', 'd', 'a', 'b', 'c', 'e'],
      layout: { ...view.layout, mode: 'focus' as const },
    };
    const layout = expectGeometry(ungrouped, { width: 1800, height: 900 });
    expect(layout.focused?.channel).toBe('u');
    expect(layout.focused?.groupId).toBe('ungrouped');
    expect(layout.sections.map((section) => section.id)).toEqual(['gta', 'minecraft']);
    const noMain = { ...ungrouped, channels: ungrouped.channels.filter((c) => c !== 'u') };
    expect(expectGeometry(noMain, { width: 1800, height: 900 }).focused?.channel).toBe('d');
  });

  it.each([
    { width: 1800, height: 900 },
    { width: 480, height: 780 },
    { width: 320, height: 200 },
  ])('keeps all singleton groups reachable with a global focus at %j', (size) => {
    const channels = Array.from({ length: 16 }, (_, i) => `channel${i}`);
    const singletons = {
      ...addChannels(emptyView(), channels),
      groups: channels.map((channel, i) => ({
        id: `g${i}`,
        name: `Group ${i}`,
        channels: [channel],
      })),
    };
    for (const main of [channels[0]!, channels.at(-1)!]) {
      const layout = expectGeometry(setMain(singletons, main), size);
      expect(layout.focused?.channel).toBe(main);
      expect(layout.sections).toHaveLength(15);
      expect(layout.sections.some((section) => section.id === layout.focused?.groupId)).toBe(false);
    }
  });

  it('honors manual main sizing while retaining clustered peers', () => {
    const focused = setMain(view, 'e');
    const size = { width: 1800, height: 1000 };
    const small = expectGeometry(
      { ...focused, layout: { ...focused.layout, mainScale: 0.5 } },
      size,
    );
    const big = expectGeometry({ ...focused, layout: { ...focused.layout, mainScale: 0.9 } }, size);
    expect(big.tiles.get('e')!.width).toBeGreaterThan(small.tiles.get('e')!.width);
    expect(small.tiles.get('e')!.width).toBeCloseTo(
      ((size.height - SECTION_LABEL_HEIGHT) * 16) / 9 / 2,
      -1,
    );
    expectGeometry(
      { ...focused, layout: { ...focused.layout, mainScale: 1 } },
      { width: 320, height: 200 },
    );
  });

  it('fits sixteen streams in uneven and large clusters while focus moves between them', () => {
    const channels = Array.from({ length: 16 }, (_, i) => `channel${i}`);
    for (const groupSizes of [
      [8, 8],
      [15, 1],
      [9, 3, 2, 1, 1],
    ]) {
      let offset = 0;
      const groups = groupSizes.map((count, i) => {
        const group = {
          id: `g${i}`,
          name: `Group ${i}`,
          channels: channels.slice(offset, offset + count),
        };
        offset += count;
        return group;
      });
      const grouped = { ...addChannels(emptyView(), channels), groups };
      for (const size of [
        { width: 1800, height: 900 },
        { width: 480, height: 780 },
      ]) {
        for (const main of [channels[0]!, channels.at(-1)!]) {
          const layout = expectGeometry(setMain(grouped, main), size);
          expect(layout.focused?.channel).toBe(main);
        }
      }
    }
  });

  it('keeps every stream reachable when a group is too small for a focus side strip', () => {
    const crowded = setMain(view, 'b');
    const layout = computeGroupedLayout(
      crowded,
      streamSections(crowded),
      { width: 320, height: 200 },
      DEFAULT_LAYOUT_OPTIONS,
    );
    expect(layout.tiles.size).toBe(5);
    expect(layout.order).toHaveLength(5);
  });

  it('uses native video aspect ratios without reserving per-stream controls space', () => {
    for (const mode of ['grid', 'focus'] as const) {
      const layoutView = { ...view, layout: { ...view.layout, mode } };
      const layout = computeGroupedLayout(
        layoutView,
        streamSections(layoutView),
        { width: 1800, height: 1000 },
        DEFAULT_LAYOUT_OPTIONS,
      );
      expect(layout.tiles.size).toBe(5);
      for (const rect of layout.tiles.values()) {
        expect(
          Math.abs(rect.height - rect.width / DEFAULT_LAYOUT_OPTIONS.aspect),
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
