import { centerRects, minTileForAspect } from './geometry';
import type { LayoutOptions, Rect, Size } from './types';

/** Main-stream size: 'auto', or a fraction (0–1] of the largest possible main. */
export type MainScale = 'auto' | number;

export const MIN_MAIN_SCALE = 0.35;
/** Tiles smaller than this are never produced by a manual main size. */
const ABSOLUTE_MIN_TILE_WIDTH = 160;
/** In auto mode the main stream stays at least this many times wider than the others. */
const AUTO_MIN_RATIO = 1.5;
/** When the minimum can't be met, the main stays at least this many times wider. */
const FALLBACK_MIN_RATIO = 1.6;
/** …but never more than this many times wider, so the others stay watchable. */
const FALLBACK_MAX_RATIO = 3;

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * "Focus" layout: slot 0 is a large main stream, the others are smaller.
 *
 * - `scale: 'auto'`: up to 4 small streams form a strip beside or below the
 *   main stream whose edges line up exactly with it (a column as tall as the
 *   main stream, or a row as wide). More wrap around it: down the right side,
 *   then along the bottom (see `wrappedL`), before a second line is added.
 * - a number (the zoom slider): the main stream gets that share of the space
 *   and the others fill the L-shape to its right and below it.
 *
 * The whole composition is centred in the container.
 */
export function computeFocusLayout(
  count: number,
  container: Size,
  opts: LayoutOptions,
  scale: MainScale = 'auto',
): Rect[] {
  if (count <= 0 || container.width <= 0 || container.height <= 0) return [];
  const maxMainWidth = Math.min(container.width, container.height * opts.aspect);
  if (count === 1) {
    return centerRects(
      [{ x: 0, y: 0, width: maxMainWidth, height: maxMainWidth / opts.aspect }],
      container,
    );
  }

  const others = count - 1;
  if (scale === 'auto') {
    const aligned =
      others > MAX_PER_LINE
        ? (wrappedL(others, container, opts) ?? alignedStrip(others, container, opts))
        : alignedStrip(others, container, opts);
    if (aligned) return aligned;
    return arrange(autoMainWidth(others, container, opts, maxMainWidth), others, container, opts)
      .rects;
  }
  return arrange(
    manualMainWidth(others, container, opts, maxMainWidth, scale),
    others,
    container,
    opts,
  ).rects;
}

/** The main stream stays at least this many times wider than the strip's tiles. */
const ALIGNED_MIN_RATIO = 1.5;
/** Streams per line along the main stream's edge before a second line is added. */
const MAX_PER_LINE = 4;

/**
 * Main stream plus a strip of the other streams, flush with the main stream's
 * edges: beside it (strip height = main height) or below it (strip width =
 * main width). Up to 4 streams sit in one line; more use up to 3 lines.
 * Picks the side (right or bottom) with the most total video area. Returns null if none fits sensibly.
 */
export function alignedStrip(others: number, c: Size, opts: LayoutOptions): Rect[] | null {
  const { gap: g, aspect: a } = opts;
  let best: Rect[] | null = null;
  let bestArea = 0;

  // One clean line along the main stream's edge for up to 4 streams; extra
  // lines (up to 3) only when there are more, or when one line won't fit.
  const firstLines = Math.min(3, Math.ceil(others / MAX_PER_LINE));
  for (const side of ['right', 'bottom'] as const) {
    for (let lines = firstLines; lines <= Math.min(3, others); lines++) {
      // lines = columns in a side strip, rows in a bottom strip.
      const per = Math.ceil(others / lines); // tiles along the main stream's edge
      let mw: number;
      if (side === 'right') {
        // Tile height fills the main height: tileW = (mw - a·(per-1)·g) / per.
        // Width: mw + g + lines·tileW + (lines-1)·g = W.
        mw = (c.width - g * lines + (lines * a * (per - 1) * g) / per) / (1 + lines / per);
        mw = Math.min(mw, c.height * a);
      } else {
        // Tile width fills the main width: tileW = (mw - (per-1)·g) / per.
        // Height: mw/a + g + lines·tileW/a + (lines-1)·g = H.
        mw = (c.height - g * lines + (lines * (per - 1) * g) / (per * a)) / ((1 + lines / per) / a);
        mw = Math.min(mw, c.width);
      }
      const mh = mw / a;
      const tileW = side === 'right' ? (mw - a * (per - 1) * g) / per : (mw - (per - 1) * g) / per;
      const tileH = tileW / a;
      if (tileW <= 0 || mw < ALIGNED_MIN_RATIO * tileW) continue;

      const rects: Rect[] = [{ x: 0, y: 0, width: mw, height: mh }];
      for (let i = 0; i < others; i++) {
        const along = i % per; // position along the main stream's edge
        const line = Math.floor(i / per);
        rects.push(
          side === 'right'
            ? {
                x: mw + g + line * (tileW + g),
                y: along * (tileH + g),
                width: tileW,
                height: tileH,
              }
            : {
                x: along * (tileW + g),
                y: mh + g + line * (tileH + g),
                width: tileW,
                height: tileH,
              },
        );
      }
      const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
      if (area > bestArea) {
        bestArea = area;
        best = rects;
      }
      break; // the fewest lines that fit wins for this side
    }
  }
  return best && centerRects(best, c);
}

/**
 * Main stream with the others wrapped around it in an L: a column down its
 * right side (as tall as the main stream), then a row along the bottom
 * (right-aligned under the corner, so the L stays joined). All small tiles are
 * the same size and the main stream is n×n tiles. Up to 4 streams per side
 * in one line (9 in total); more add a second line on both sides, and so on.
 * Returns null if it doesn't fit.
 */
export function wrappedL(others: number, c: Size, opts: LayoutOptions): Rect[] | null {
  const { gap: g, aspect: a } = opts;
  // Lines around the main stream: one L of up to 4 + 5 streams, then deeper.
  let depth = 1;
  while (depth < 3 && depth * (2 * MAX_PER_LINE + depth) < others) depth++;
  // Main stream n tiles wide: the smallest that holds everyone (at least 2).
  let n = 2;
  while (depth * (2 * n + depth) < others) n++;

  const span = n + depth; // tiles across (and down) the whole composition
  const tileW = Math.min(
    (c.width - (span - 1) * g) / span,
    (a * (c.height - (span - 1) * g)) / span,
  );
  const tileH = tileW / a;
  if (tileW <= 0) return null;
  const step = { x: tileW + g, y: tileH + g };
  const mainW = n * tileW + (n - 1) * g;
  const main = { x: 0, y: 0, width: mainW, height: mainW / a };
  // The right column spans exactly the main stream's height (its gaps are a
  // touch smaller than `g`, since the main stream keeps its exact 16:9).
  const colStep = n > 1 ? (main.height - tileH) / (n - 1) : 0;

  // Slots: the right block (column by column), then the bottom block (row by
  // row), each line holding as many as it can.
  const rects: Rect[] = [main];
  let left = others;
  for (let col = 0; col < depth && left > 0; col++) {
    for (let row = 0; row < n && left > 0; row++, left--) {
      rects.push({ x: (n + col) * step.x, y: row * colStep, width: tileW, height: tileH });
    }
  }
  for (let row = 0; row < depth && left > 0; row++) {
    const inRow = Math.min(left, span);
    for (let i = 0; i < inRow; i++) {
      rects.push({
        x: (span - inRow + i) * step.x,
        y: main.height + g + row * step.y,
        width: tileW,
        height: tileH,
      });
    }
    left -= inRow;
  }
  return centerRects(rects, c);
}

function autoMainWidth(others: number, c: Size, opts: LayoutOptions, maxMain: number): number {
  const minTile = minTileForAspect(opts.minTile, opts.aspect).width;
  const steps = 100;
  // Largest main whose side tiles still meet the autoplay minimum.
  for (let i = steps; i >= 1; i--) {
    const mw = (maxMain * i) / steps;
    const { tileWidth } = arrange(mw, others, c, opts);
    if (tileWidth >= minTile - 0.5 && mw >= AUTO_MIN_RATIO * tileWidth) return mw;
  }
  // The area is too small for that: take the biggest main stream that stays
  // clearly the largest without shrinking the others to thumbnails.
  for (let i = steps; i >= 1; i--) {
    const mw = (maxMain * i) / steps;
    const { tileWidth } = arrange(mw, others, c, opts);
    if (
      tileWidth > 0 &&
      mw >= FALLBACK_MIN_RATIO * tileWidth &&
      mw <= FALLBACK_MAX_RATIO * tileWidth
    ) {
      return mw;
    }
  }
  return maxMain * 0.6;
}

function manualMainWidth(
  others: number,
  c: Size,
  opts: LayoutOptions,
  maxMain: number,
  scale: number,
): number {
  const clamped = Math.min(1, Math.max(MIN_MAIN_SCALE, scale));
  // Shrink the main until the other tiles have at least a usable size.
  for (let s = clamped; s > MIN_MAIN_SCALE / 2; s -= 0.01) {
    const mw = maxMain * s;
    if (arrange(mw, others, c, opts).tileWidth >= ABSOLUTE_MIN_TILE_WIDTH) return mw;
  }
  return maxMain * MIN_MAIN_SCALE;
}

function capacity(r: Region, tileW: number, opts: LayoutOptions): number {
  if (r.width <= 0 || r.height <= 0 || tileW <= 0) return 0;
  const tileH = tileW / opts.aspect;
  const cols = Math.floor((r.width + opts.gap + 1e-6) / (tileW + opts.gap));
  const rows = Math.floor((r.height + opts.gap + 1e-6) / (tileH + opts.gap));
  return Math.max(0, cols) * Math.max(0, rows);
}

function arrange(
  mainWidth: number,
  others: number,
  c: Size,
  opts: LayoutOptions,
): { rects: Rect[]; tileWidth: number } {
  const { gap, aspect } = opts;
  const mainHeight = mainWidth / aspect;
  const right: Region = {
    x: mainWidth + gap,
    y: 0,
    width: c.width - mainWidth - gap,
    height: c.height,
  };
  const below: Region = {
    x: 0,
    y: mainHeight + gap,
    width: mainWidth,
    height: c.height - mainHeight - gap,
  };

  // Largest tile width that fits all the other streams (binary search).
  let lo = 0;
  let hi = Math.max(
    Math.min(right.width, right.height * aspect),
    Math.min(below.width, below.height * aspect),
    0,
  );
  const fits = (w: number) => capacity(right, w, opts) + capacity(below, w, opts) >= others;
  if (hi <= 0 || !fits(Math.min(hi, 1))) {
    return { rects: [{ x: 0, y: 0, width: mainWidth, height: mainHeight }], tileWidth: 0 };
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  const tileW = lo;
  const tileH = tileW / aspect;

  const rects: Rect[] = [{ x: 0, y: 0, width: mainWidth, height: mainHeight }];
  let remaining = others;
  for (const region of [right, below]) {
    const n = Math.min(remaining, capacity(region, tileW, opts));
    if (n === 0) continue;
    const cols = Math.max(1, Math.floor((region.width + gap + 1e-6) / (tileW + gap)));
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      rects.push({
        x: region.x + col * (tileW + gap),
        y: region.y + row * (tileH + gap),
        width: tileW,
        height: tileH,
      });
    }
    remaining -= n;
  }
  return { rects: centerRects(rects, c), tileWidth: tileW };
}
