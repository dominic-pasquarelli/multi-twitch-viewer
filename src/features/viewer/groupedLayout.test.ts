import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT_OPTIONS } from '@/lib/layout';
import { streamSections } from '@/lib/view/groups';
import { addChannels, emptyView, setMain } from '@/lib/view/operations';
import { computeGroupedLayout } from './groupedLayout';

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
  it('focuses each section independently and isolated tabs use only their members', () => {
    const focused = setMain(view, 'b');
    const all = computeGroupedLayout(
      focused,
      streamSections(focused),
      { width: 1800, height: 900 },
      DEFAULT_LAYOUT_OPTIONS,
    );
    expect(all.tiles.get('b')!.width).toBeGreaterThan(all.tiles.get('a')!.width);
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
