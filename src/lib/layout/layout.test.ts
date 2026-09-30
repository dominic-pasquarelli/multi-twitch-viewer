import { describe, expect, it } from 'vitest';
import {
  area,
  computeFocusLayout,
  computeGridLayout,
  computeLayout,
  DEFAULT_LAYOUT_OPTIONS as opts,
  isBelowMinimum,
  partitions,
  rectIndexAt,
  type Rect,
  type Size,
} from './index';

const FHD: Size = { width: 1920, height: 1080 };
const WIDE: Size = { width: 1864, height: 926 };

function expectInside(rects: Rect[], c: Size) {
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(-0.01);
    expect(r.y).toBeGreaterThanOrEqual(-0.01);
    expect(r.x + r.width).toBeLessThanOrEqual(c.width + 0.01);
    expect(r.y + r.height).toBeLessThanOrEqual(c.height + 0.01);
  }
}

function expectNoOverlap(rects: Rect[]) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      const overlap =
        a.x < b.x + b.width - 0.01 &&
        b.x < a.x + a.width - 0.01 &&
        a.y < b.y + b.height - 0.01 &&
        b.y < a.y + a.height - 0.01;
      expect(overlap, `rects ${i} and ${j} overlap`).toBe(false);
    }
  }
}

function expectAspect(rects: Rect[]) {
  for (const r of rects) expect(r.width / r.height).toBeCloseTo(16 / 9, 3);
}

describe('partitions', () => {
  it('lists integer partitions in ascending order', () => {
    expect(partitions(4, 4)).toEqual([[4], [1, 3], [2, 2], [1, 1, 2], [1, 1, 1, 1]]);
  });
  it('respects the max number of parts', () => {
    expect(partitions(4, 2)).toEqual([[4], [1, 3], [2, 2]]);
  });
});

describe('computeGridLayout', () => {
  it('returns nothing for zero streams or an empty container', () => {
    expect(computeGridLayout(0, FHD, opts)).toEqual([]);
    expect(computeGridLayout(3, { width: 0, height: 500 }, opts)).toEqual([]);
  });

  it('fills a 16:9 screen with a single stream', () => {
    const [r] = computeGridLayout(1, FHD, opts);
    expect(r).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('uses a 2x2 grid for four streams on a 16:9 screen', () => {
    const rects = computeGridLayout(4, FHD, opts);
    for (const r of rects) expect(r.width).toBeCloseTo(((1080 - 4) / 2) * (16 / 9), 3);
  });

  it('puts 2 big + 3 smaller tiles for five streams instead of wasting a row', () => {
    const rects = computeGridLayout(5, WIDE, opts);
    const widths = rects.map((r) => Math.round(r.width));
    expect(widths[0]).toBeGreaterThan(widths[4]!);
    // Much more video area than a uniform 3x2 grid (which would be ~62%).
    const fill = rects.reduce((s, r) => s + area(r), 0) / area(WIDE);
    expect(fill).toBeGreaterThan(0.85);
  });

  it('keeps equal tiles for three streams (2x2 with a centred last row)', () => {
    const rects = computeGridLayout(3, FHD, opts);
    expect(new Set(rects.map((r) => Math.round(r.width))).size).toBe(1);
    const last = rects[2]!;
    expect(last.x + last.width / 2).toBeCloseTo(960, 0);
  });

  it('stacks two streams vertically in a tall area', () => {
    const rects = computeGridLayout(2, { width: 900, height: 1000 }, opts);
    expect(rects[0]!.x).toBeCloseTo(rects[1]!.x, 5);
    expect(rects[1]!.y).toBeGreaterThan(rects[0]!.y);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16])(
    'produces valid rects for %i streams in several containers',
    (n) => {
      for (const c of [FHD, WIDE, { width: 1300, height: 926 }, { width: 800, height: 1400 }]) {
        const rects = computeGridLayout(n, c, opts);
        expect(rects).toHaveLength(n);
        expectInside(rects, c);
        expectNoOverlap(rects);
        expectAspect(rects);
      }
    },
  );

  it('keeps every tile above the Twitch autoplay minimum when possible', () => {
    for (let n = 1; n <= 9; n++) {
      const rects = computeGridLayout(n, FHD, opts);
      expect(rects.some((r) => isBelowMinimum(r, opts.minTile))).toBe(false);
    }
  });
});

describe('computeFocusLayout', () => {
  it('makes slot 0 clearly the biggest', () => {
    for (let n = 2; n <= 9; n++) {
      const rects = computeFocusLayout(n, FHD, opts);
      expect(rects).toHaveLength(n);
      for (const r of rects.slice(1)) expect(rects[0]!.width).toBeGreaterThan(r.width * 1.4);
      expectInside(rects, FHD);
      expectNoOverlap(rects);
      expectAspect(rects);
    }
  });

  it('auto lines the side strip up with the main stream (top and bottom edges)', () => {
    const area = { width: 1868, height: 905 }; // a typical window with the sidebar collapsed
    const rects = computeFocusLayout(5, area, opts);
    const [main, ...side] = rects as [Rect, ...Rect[]];
    // One column to the right, flush with the main stream.
    for (const r of side) expect(r.x).toBeGreaterThan(main.x + main.width);
    expect(side[0]!.y).toBeCloseTo(main.y, 3);
    expect(side.at(-1)!.y + side.at(-1)!.height).toBeCloseTo(main.y + main.height, 3);
    // Fills the width.
    expect(side[0]!.x + side[0]!.width - main.x).toBeCloseTo(area.width, 1);
    expectNoOverlap(rects);
    expectAspect(rects);
  });

  it('auto puts the strip below the main stream in a tall area, as wide as the main stream', () => {
    const area = { width: 1000, height: 1100 };
    const rects = computeFocusLayout(4, area, opts);
    const [main, ...small] = rects as [Rect, ...Rect[]];
    for (const r of small) expect(r.y).toBeGreaterThan(main.y + main.height);
    // The first (full) row spans exactly the main stream's width.
    const firstRow = small.filter((r) => Math.abs(r.y - small[0]!.y) < 1);
    expect(firstRow[0]!.x).toBeCloseTo(main.x, 3);
    expect(firstRow.at(-1)!.x + firstRow.at(-1)!.width).toBeCloseTo(main.x + main.width, 3);
    expectInside(rects, area);
    expectNoOverlap(rects);
  });

  it('auto uses a tall window (half a monitor) instead of leaving it empty', () => {
    const area = { width: 1010, height: 1290 };
    // Two streams: the main one full width, the other clearly smaller below it.
    const [main, other] = computeFocusLayout(2, area, opts) as [Rect, Rect];
    expect(main.width).toBeCloseTo(1010, 0);
    expect(other.y).toBeGreaterThan(main.y + main.height);
    expect(other.width).toBeGreaterThan(main.width / 1.6);
    expect(other.width).toBeLessThan(main.width);
    // Centred under it.
    expect(other.x + other.width / 2).toBeCloseTo(main.x + main.width / 2, 0);
    // Five streams: two rows of small ones rather than one thin row.
    const five = computeFocusLayout(5, area, opts);
    expect(new Set(five.slice(1).map((r) => Math.round(r.y))).size).toBe(2);
    for (const rects of [computeFocusLayout(2, area, opts), five]) {
      expectInside(rects, area);
      expectNoOverlap(rects);
      expectAspect(rects);
    }
  });

  it('auto wraps many streams down the right side, then along the bottom', () => {
    const area = { width: 1868, height: 905 };
    for (const count of [6, 7, 8, 10]) {
      const rects = computeFocusLayout(count, area, opts);
      const [main, ...small] = rects as [Rect, ...Rect[]];
      const below = small.filter((r) => r.y >= main.y + main.height);
      const right = small.filter((r) => r.x >= main.x + main.width && !below.includes(r));
      // One column on the right (as tall as the main stream)…
      expect(new Set(right.map((r) => Math.round(r.x))).size).toBe(1);
      expect(right[0]!.y).toBeCloseTo(main.y, 3);
      expect(right.at(-1)!.y + right.at(-1)!.height).toBeCloseTo(main.y + main.height, 3);
      // …then one row below, joined to it at the corner.
      expect(right.length + below.length).toBe(count - 1);
      expect(new Set(below.map((r) => Math.round(r.y))).size).toBe(1);
      expect(below.at(-1)!.x + below.at(-1)!.width).toBeCloseTo(right[0]!.x + right[0]!.width, 3);
      // Same size small tiles, all inside, no overlaps.
      expect(new Set(small.map((r) => Math.round(r.width))).size).toBe(1);
      expectInside(rects, area);
      expectNoOverlap(rects);
    }
  });

  it('auto adds a second line only when the L is full', () => {
    const one = computeFocusLayout(10, FHD, opts); // 9 others: one L
    const two = computeFocusLayout(12, FHD, opts); // 11 others: two lines
    const cols = (rects: Rect[]) => {
      const main = rects[0]!;
      return new Set(
        rects
          .slice(1)
          .filter((r) => r.x >= main.x + main.width)
          .map((r) => Math.round(r.x)),
      ).size;
    };
    expect(cols(one)).toBe(1);
    expect(cols(two)).toBe(2);
    expectInside(two, FHD);
    expectNoOverlap(two);
  });

  it('manual zoom wraps extra tiles under the main stream (L shape)', () => {
    const rects = computeFocusLayout(6, FHD, opts, 0.66);
    const main = rects[0]!;
    expect(rects.slice(1).some((r) => r.y >= main.y + main.height)).toBe(true);
    expect(rects.slice(1).some((r) => r.x >= main.x + main.width)).toBe(true);
  });

  it('honours a manual main size', () => {
    const small = computeFocusLayout(3, FHD, opts, 0.5)[0]!;
    const big = computeFocusLayout(3, FHD, opts, 0.9)[0]!;
    expect(big.width).toBeGreaterThan(small.width);
    expect(small.width).toBeCloseTo(960, 0);
  });

  it('never lets a manual size squeeze the other tiles to nothing', () => {
    const rects = computeFocusLayout(4, FHD, opts, 1);
    expect(rects).toHaveLength(4);
    for (const r of rects.slice(1)) expect(r.width).toBeGreaterThanOrEqual(159);
    expectNoOverlap(rects);
  });

  it('balances sizes when the area is too small for the autoplay minimum', () => {
    const c = { width: 1336, height: 855 };
    const rects = computeFocusLayout(5, c, opts);
    const main = rects[0]!;
    const side = rects[1]!;
    expect(main.width).toBeGreaterThanOrEqual(side.width * 1.59);
    // The others stay watchable instead of collapsing into a thin strip.
    expect(side.width).toBeGreaterThan(300);
    expectInside(rects, c);
    expectNoOverlap(rects);
  });

  it('a single stream fills the area', () => {
    expect(computeFocusLayout(1, FHD, opts)[0]).toMatchObject({ width: 1920, height: 1080 });
  });
});

describe('computeLayout', () => {
  it('snaps to whole pixels', () => {
    const rects = computeLayout({ mode: 'grid', count: 3, container: WIDE, options: opts });
    for (const r of rects) {
      expect(Number.isInteger(r.x) && Number.isInteger(r.width)).toBe(true);
    }
    expectNoOverlap(rects);
  });
});

describe('rectIndexAt', () => {
  it('finds the rect under a point', () => {
    const rects = computeLayout({ mode: 'grid', count: 4, container: FHD, options: opts });
    expect(rectIndexAt(rects, { x: 10, y: 10 })).toBe(0);
    expect(rectIndexAt(rects, { x: 1900, y: 1070 })).toBe(3);
    expect(rectIndexAt(rects, { x: 960, y: -5 })).toBe(-1);
  });
});
