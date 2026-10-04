import { computeLayout, type LayoutOptions, type Rect, type Size } from '@/lib/layout';
import type { StreamSection } from '@/lib/view/groups';
import { slotOrder } from '@/lib/view/operations';
import type { ViewState } from '@/lib/view/types';

export const SECTION_LABEL_HEIGHT = 24;

export interface PositionedSection extends StreamSection {
  rect: Rect;
}

export interface GroupedLayout {
  sections: PositionedSection[];
  tiles: Map<string, Rect>;
  order: string[];
  rects: Rect[];
}

/** Fit each group independently, keeping the tiles in a single stable DOM list. */
export function computeGroupedLayout(
  view: ViewState,
  sections: StreamSection[],
  size: Size,
  options: LayoutOptions,
): GroupedLayout {
  const labeled = !!view.groups?.length;
  const labelHeight = labeled ? SECTION_LABEL_HEIGHT : 0;
  const gap = options.gap;
  if (!sections.length || size.width <= 0 || size.height <= 0) {
    return { sections: [], tiles: new Map(), order: [], rects: [] };
  }
  const candidates: Rect[][] = [];
  const count = sections.length;
  // Equal section grids handle many groups; weighted bands give larger groups
  // more room when two or three groups are watched together.
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const width = Math.max(0, (size.width - gap * (cols - 1)) / cols);
    const height = Math.max(0, (size.height - gap * (rows - 1)) / rows);
    candidates.push(
      sections.map((_, i) => ({
        x: (i % cols) * (width + gap),
        y: Math.floor(i / cols) * (height + gap),
        width,
        height,
      })),
    );
  }
  if (count > 1) {
    const total = sections.reduce((n, section) => n + section.channels.length, 0);
    for (const vertical of [false, true]) {
      let offset = 0;
      const available = Math.max(0, (vertical ? size.height : size.width) - gap * (count - 1));
      candidates.push(
        sections.map((section) => {
          const extent = (available * section.channels.length) / total;
          const rect = vertical
            ? { x: 0, y: offset, width: size.width, height: extent }
            : { x: offset, y: 0, width: extent, height: size.height };
          offset += extent + gap;
          return rect;
        }),
      );
    }
  }
  const place = (regions: Rect[]): GroupedLayout => {
    const tiles = new Map<string, Rect>();
    const order: string[] = [];
    const positioned = sections.map((section, i) => {
      const rect = regions[i]!;
      const channels = slotOrder(view, section.channels);
      const request = {
        mode: view.layout.mode,
        count: channels.length,
        container: { width: rect.width, height: Math.max(0, rect.height - labelHeight) },
        options,
        mainScale: view.layout.mainScale,
      };
      let tileRects = computeLayout(request);
      // Very small group regions can no longer fit the focus arrangement's
      // side strip. Keep every stream reachable with a grid in that section.
      if (tileRects.length < channels.length)
        tileRects = computeLayout({ ...request, mode: 'grid' });
      channels.forEach((login, j) => {
        const tile = tileRects[j];
        if (!tile) return;
        tiles.set(login, { ...tile, x: tile.x + rect.x, y: tile.y + rect.y + labelHeight });
        order.push(login);
      });
      return { ...section, rect };
    });
    return { sections: positioned, tiles, order, rects: order.map((login) => tiles.get(login)!) };
  };
  const score = (layout: GroupedLayout) => {
    const areas = layout.rects.map((r) => r.width * r.height);
    return {
      count: areas.length,
      min: Math.min(...areas),
      total: areas.reduce((a, b) => a + b, 0),
    };
  };
  let best = place(candidates[0]!);
  let bestScore = score(best);
  for (const candidate of candidates.slice(1)) {
    const layout = place(candidate);
    const next = score(layout);
    if (
      next.count > bestScore.count ||
      (next.count === bestScore.count &&
        (next.min > bestScore.min * 1.02 ||
          (next.min >= bestScore.min * 0.98 && next.total > bestScore.total)))
    ) {
      best = layout;
      bestScore = next;
    }
  }
  return best;
}
