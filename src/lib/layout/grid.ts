import { area, centerRects, isBelowMinimum } from './geometry';
import type { LayoutOptions, Rect, Size } from './types';

/**
 * "Grid" layout: packs `count` tiles so the videos are as large as possible.
 *
 * Several families of arrangements are generated and scored:
 *  - uniform grids (every tile the same size, last row centred)
 *  - justified rows, e.g. 2 big tiles on top and 3 smaller below
 *  - justified columns (the same idea turned sideways, for tall areas)
 *
 * The winner is chosen by, in order: every tile meets Twitch's minimum
 * autoplay size, the smallest tile is as big as possible, the total video area
 * is as big as possible, and finally the fewest distinct tile sizes.
 * Slot 0 is always one of the largest tiles.
 */
export function computeGridLayout(count: number, container: Size, opts: LayoutOptions): Rect[] {
  if (count <= 0 || container.width <= 0 || container.height <= 0) return [];

  const candidates: Rect[][] = [];
  for (let cols = 1; cols <= count; cols++) {
    candidates.push(uniformGrid(count, cols, container, opts));
  }
  for (const rows of partitions(count, 6)) {
    if (rows.length < 2 || rows.every((k) => k === rows[0])) continue; // uniform grids cover these
    candidates.push(justifiedRows(rows, container, opts));
    candidates.push(transpose(justifiedRows(rows, transposeSize(container), transposeOpts(opts))));
  }

  let best = candidates[0]!;
  let bestScore = score(best, opts);
  for (const candidate of candidates.slice(1)) {
    const s = score(candidate, opts);
    if (compareScores(s, bestScore) > 0) {
      best = candidate;
      bestScore = s;
    }
  }
  return best;
}

interface Score {
  allMeetMinimum: boolean;
  minArea: number;
  totalArea: number;
  distinctSizes: number;
}

function score(rects: Rect[], opts: LayoutOptions): Score {
  const areas = rects.map(area);
  return {
    allMeetMinimum: rects.every((r) => !isBelowMinimum(r, opts.minTile)),
    minArea: Math.min(...areas),
    totalArea: areas.reduce((a, b) => a + b, 0),
    distinctSizes: new Set(rects.map((r) => Math.round(r.width))).size,
  };
}

/** Positive when `a` is better than `b`. Areas within 2% count as equal. */
function compareScores(a: Score, b: Score): number {
  if (a.allMeetMinimum !== b.allMeetMinimum) return a.allMeetMinimum ? 1 : -1;
  const rel = (x: number, y: number) => (x - y) / Math.max(x, y, 1);
  const minDiff = rel(a.minArea, b.minArea);
  if (Math.abs(minDiff) > 0.02) return minDiff;
  const totalDiff = rel(a.totalArea, b.totalArea);
  if (Math.abs(totalDiff) > 0.02) return totalDiff;
  return b.distinctSizes - a.distinctSizes;
}

function uniformGrid(count: number, cols: number, c: Size, opts: LayoutOptions): Rect[] {
  const { gap, aspect } = opts;
  const rows = Math.ceil(count / cols);
  const cellW = (c.width - (cols - 1) * gap) / cols;
  const cellH = (c.height - (rows - 1) * gap) / rows;
  const width = Math.max(0, Math.min(cellW, cellH * aspect));
  const height = width / aspect;

  const rects: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? count - row * cols : cols;
    const col = i - row * cols;
    const rowWidth = inRow * width + (inRow - 1) * gap;
    rects.push({
      x: (cols * width + (cols - 1) * gap - rowWidth) / 2 + col * (width + gap),
      y: row * (height + gap),
      width,
      height,
    });
  }
  return centerRects(rects, c);
}

/** Rows with `rows[i]` tiles each; each row spans the width, then all scale to fit. */
function justifiedRows(rows: number[], c: Size, opts: LayoutOptions): Rect[] {
  const { gap, aspect } = opts;
  const widths = rows.map((k) => (c.width - (k - 1) * gap) / k);
  const heights = widths.map((w) => w / aspect);
  const available = c.height - (rows.length - 1) * gap;
  const total = heights.reduce((a, b) => a + b, 0);
  const scale = total > available ? Math.max(0, available / total) : 1;

  const rects: Rect[] = [];
  let y = 0;
  rows.forEach((k, i) => {
    const width = widths[i]! * scale;
    const height = heights[i]! * scale;
    const rowWidth = k * width + (k - 1) * gap;
    const x0 = (c.width - rowWidth) / 2;
    for (let j = 0; j < k; j++) rects.push({ x: x0 + j * (width + gap), y, width, height });
    y += height + gap;
  });
  return centerRects(rects, c);
}

const transposeSize = (s: Size): Size => ({ width: s.height, height: s.width });
const transposeOpts = (o: LayoutOptions): LayoutOptions => ({
  ...o,
  aspect: 1 / o.aspect,
  minTile: transposeSize(o.minTile),
});
const transpose = (rects: Rect[]): Rect[] =>
  rects.map((r) => ({ x: r.y, y: r.x, width: r.height, height: r.width }));

/**
 * Integer partitions of n with at most `maxParts` parts, each listed in
 * ascending order (fewest tiles first, so the biggest tiles come first).
 */
export function partitions(n: number, maxParts: number): number[][] {
  const out: number[][] = [];
  const walk = (remaining: number, maxPart: number, acc: number[]) => {
    if (remaining === 0) {
      out.push([...acc].reverse());
      return;
    }
    if (acc.length === maxParts) return;
    for (let part = Math.min(remaining, maxPart); part >= 1; part--) {
      acc.push(part);
      walk(remaining - part, part, acc);
      acc.pop();
    }
  };
  walk(n, n, []);
  return out;
}
