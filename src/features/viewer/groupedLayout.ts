import {
  computeLayout,
  MIN_MAIN_SCALE,
  roundRects,
  type LayoutOptions,
  type Rect,
  type Size,
} from '@/lib/layout';
import type { StreamSection } from '@/lib/view/groups';
import { mainChannel, slotOrder, focusedChannels } from '@/lib/view/operations';
import type { ViewState } from '@/lib/view/types';

export const SECTION_LABEL_HEIGHT = 24;

export interface PositionedSection extends StreamSection {
  rect: Rect;
}

export interface GroupedLayout {
  sections: PositionedSection[];
  /** Separate labels for every large stream in multi-focus. */
  focuses?: NonNullable<GroupedLayout['focused']>[];
  focused?: {
    channel: string;
    groupId: string;
    groupName: string;
    /** Contains the separate focus label and the main video below it. */
    rect: Rect;
  };
  tiles: Map<string, Rect>;
  order: string[];
  rects: Rect[];
}

/** Keep a global focus or grouped grids in a single stable DOM list. */
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
  if (view.layout.mode === 'multi-focus') return computeMultiFocus(view, sections, size, options);
  const mode = view.layout.mode;
  if (view.layout.mode === 'focus' && sections.length > 1)
    return computeGlobalFocus(view, sections, size, options);
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
        mode,
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

/** Equal-size focus tiles, including label space, centered in the available region. */
function equalFocusGrid(count: number, size: Size, options: LayoutOptions, label: number): Rect[] {
  if (!count) return [];
  let best: Rect[] = [];
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const width = Math.max(
      0,
      Math.min(
        (size.width - (cols - 1) * options.gap) / cols,
        ((size.height - (rows - 1) * options.gap) / rows - label) * options.aspect,
      ),
    );
    if (best.length && width <= best[0]!.width) continue;
    const height = width / options.aspect;
    best = Array.from({ length: count }, (_, i) => {
      const row = Math.floor(i / cols);
      const rowCount = Math.min(cols, count - row * cols);
      return {
        x:
          (size.width - rowCount * width - (rowCount - 1) * options.gap) / 2 +
          (i % cols) * (width + options.gap),
        y:
          (size.height - rows * (height + label) - (rows - 1) * options.gap) / 2 +
          row * (height + label + options.gap) +
          label,
        width,
        height,
      };
    });
  }
  return best.map((r) => ({
    ...r,
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.floor(r.width),
    height: Math.floor(Math.floor(r.width) / options.aspect),
  }));
}

/** Two or three peers share the main region; the other groups remain smaller grids. */
function computeMultiFocus(
  view: ViewState,
  sections: StreamSection[],
  size: Size,
  options: LayoutOptions,
): GroupedLayout {
  const shown = sections.flatMap((s) => s.channels);
  const focused = focusedChannels(view, shown);
  const gridView = { ...view, layout: { ...view.layout, mode: 'grid' as const } };
  if (!focused.length) return computeGroupedLayout(gridView, sections, size, options);
  const remaining = sections
    .map((s) => ({ ...s, channels: s.channels.filter((c) => !focused.includes(c)) }))
    .filter((s) => s.channels.length);
  const label = view.groups?.length ? SECTION_LABEL_HEIGHT : 0;
  let best: GroupedLayout | null = null;
  let bestScore = -Infinity;
  for (const below of [false, true]) {
    for (const share of remaining.length ? [0.5, 0.6, 0.7, 0.8, 0.85] : [1]) {
      const focusSize = {
        width: below ? size.width : size.width * share,
        height: below ? size.height * share : size.height,
      };
      const region = below
        ? {
            x: 0,
            y: focusSize.height + options.gap,
            width: size.width,
            height: size.height - focusSize.height - options.gap,
          }
        : {
            x: focusSize.width + options.gap,
            y: 0,
            width: size.width - focusSize.width - options.gap,
            height: size.height,
          };
      const heroes = equalFocusGrid(focused.length, focusSize, options, label);
      if (heroes.some((r) => r.width <= 0 || r.height <= 0)) continue;
      const clusters = computeGroupedLayout(gridView, remaining, region, options);
      if (clusters.tiles.size !== shown.length - focused.length) continue;
      const tiles = new Map(focused.map((c, i) => [c, heroes[i]!]));
      const maxSmallWidth = heroes[0]!.width / 1.5;
      for (const [c, r] of clusters.tiles) {
        const width = Math.floor(Math.min(r.width, maxSmallWidth, r.height * options.aspect));
        const height = Math.floor(width / options.aspect);
        tiles.set(c, {
          x: region.x + r.x + (r.width - width) / 2,
          y: region.y + r.y + (r.height - height) / 2,
          width,
          height,
        });
      }
      if ([...tiles.values()].some((r) => r.width <= 0 || r.height <= 0)) continue;
      const mainArea = heroes[0]!.width * heroes[0]!.height;
      const smallAreas = clusters.order.map((c) => {
        const r = tiles.get(c)!;
        return r.width * r.height;
      });
      const score = mainArea ** 2 * (smallAreas.length ? Math.min(...smallAreas) : 1);
      if (score <= bestScore) continue;
      bestScore = score;
      const order = [...focused, ...clusters.order];
      best = {
        focuses: label
          ? focused.map((channel, i) => {
              const group = sections.find((s) => s.channels.includes(channel))!;
              const r = heroes[i]!;
              return {
                channel,
                groupId: group.id,
                groupName: group.name,
                rect: { ...r, y: r.y - label, height: r.height + label },
              };
            })
          : [],
        sections: clusters.sections.map((s) => ({
          ...s,
          rect: { ...s.rect, x: s.rect.x + region.x, y: s.rect.y + region.y },
        })),
        tiles,
        order,
        rects: order.map((c) => tiles.get(c)!),
      };
    }
  }
  return best ?? computeGroupedLayout(gridView, sections, size, options);
}

/** One main video, with intact labeled group grids beside or beneath it. */
function computeGlobalFocus(
  view: ViewState,
  sections: StreamSection[],
  size: Size,
  options: LayoutOptions,
): GroupedLayout {
  const shown = new Set(sections.flatMap((section) => section.channels));
  const main = mainChannel(
    view,
    view.channels.filter((channel) => shown.has(channel)),
  )!;
  const mainGroup = sections.find((section) => section.channels.includes(main))!;
  const remaining = sections
    .map((section) => ({
      ...section,
      channels: section.channels.filter((channel) => channel !== main),
    }))
    .filter((section) => section.channels.length);
  const gridView = { ...view, layout: { ...view.layout, mode: 'grid' as const } };
  const labelHeight = view.groups?.length ? SECTION_LABEL_HEIGHT : 0;
  const maxMainWidth = Math.min(
    size.width,
    Math.max(0, size.height - labelHeight) * options.aspect,
  );
  const manual = view.layout.mainScale !== 'auto';
  const scale = manual ? Math.max(MIN_MAIN_SCALE, Math.min(1, view.layout.mainScale as number)) : 1;
  const requestedWidth = maxMainWidth * scale;
  const steps = manual ? 26 : 13;
  let best: GroupedLayout | null = null;
  let bestScore = { usable: false, mainWidth: 0, utility: -Infinity };

  // Evaluate both orientations as the main size changes. Group-label space is
  // part of the fit, so many singleton groups also stay reachable in a narrow
  // window rather than disappearing into a focus layout's thin side strip.
  for (let step = 0; step <= steps; step++) {
    const width = requestedWidth * (1 - (step * (1 - MIN_MAIN_SCALE)) / steps);
    for (const below of [false, true]) {
      const hero = {
        x: below ? (size.width - width) / 2 : 0,
        y: below ? 0 : (size.height - labelHeight - width / options.aspect) / 2,
        width,
        height: labelHeight + width / options.aspect,
      };
      const region = below
        ? {
            x: 0,
            y: hero.height + options.gap,
            width: size.width,
            height: size.height - hero.height - options.gap,
          }
        : {
            x: width + options.gap,
            y: 0,
            width: size.width - width - options.gap,
            height: size.height,
          };
      if (region.width <= 0 || region.height <= labelHeight) continue;
      const clusters = computeGroupedLayout(gridView, remaining, region, options);
      if (
        clusters.tiles.size !== shown.size - 1 ||
        clusters.rects.some((rect) => rect.width <= 0 || rect.height <= 0)
      )
        continue;
      const mainRect = roundRects([
        { x: hero.x, y: hero.y + labelHeight, width, height: width / options.aspect },
      ])[0]!;
      if (mainRect.width <= 0 || mainRect.height <= 0) continue;
      const tiles = new Map<string, Rect>([[main, mainRect]]);
      for (const [channel, rect] of clusters.tiles) {
        // Manual zoom can leave a roomy cluster containing only one stream.
        // Keep that stream smaller than the main rather than creating another
        // apparent focus; shrinking inside its slot preserves group geometry.
        const shrink = Math.min(1, mainRect.width / (1.5 * rect.width));
        const tileWidth = shrink < 1 ? Math.floor(rect.width * shrink) : rect.width;
        const tileHeight = shrink < 1 ? Math.floor(tileWidth / options.aspect) : rect.height;
        const tile = {
          x: region.x + rect.x + (rect.width - tileWidth) / 2,
          y: region.y + rect.y + (rect.height - tileHeight) / 2,
          width: tileWidth,
          height: tileHeight,
        };
        tiles.set(channel, tile);
      }
      if ([...tiles.values()].some((rect) => rect.width <= 0 || rect.height <= 0)) continue;
      const small = [...tiles.values()].slice(1);
      const mainArea = mainRect.width * mainRect.height;
      const minArea = Math.min(...small.map((rect) => rect.width * rect.height));
      const next = {
        usable: small.every((rect) => rect.width >= 159),
        mainWidth: mainRect.width,
        // Focus carries more weight than any group while the smallest stream
        // still limits the score, preventing a huge main with tiny leftovers.
        utility: mainArea * mainArea * minArea,
      };
      const better = manual
        ? (next.usable && !bestScore.usable) ||
          (next.usable === bestScore.usable &&
            (next.mainWidth > bestScore.mainWidth ||
              (next.mainWidth === bestScore.mainWidth && next.utility > bestScore.utility)))
        : next.utility > bestScore.utility;
      if (!better) continue;
      const order = [main, ...clusters.order];
      best = {
        focused: {
          channel: main,
          groupId: mainGroup.id,
          groupName: mainGroup.name,
          rect: {
            x: mainRect.x,
            y: mainRect.y - labelHeight,
            width: mainRect.width,
            height: mainRect.height + labelHeight,
          },
        },
        sections: clusters.sections.map((section) => ({
          ...section,
          rect: { ...section.rect, x: section.rect.x + region.x, y: section.rect.y + region.y },
        })),
        tiles,
        order,
        rects: order.map((channel) => tiles.get(channel)!),
      };
      bestScore = next;
    }
    // Once a manual size fits usable peers, a smaller main cannot improve its
    // requested size. Both orientations have already been compared above.
    if (manual && bestScore.usable) break;
  }
  return best ?? { sections: [], tiles: new Map(), order: [], rects: [] };
}
