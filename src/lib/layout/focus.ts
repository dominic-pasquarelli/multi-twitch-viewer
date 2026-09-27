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
 * "Focus" layout: slot 0 is a large main stream in the top-left, and the other
 * streams fill the L-shaped space to its right and below it, all at one size.
 * The whole composition is centred in the container.
 *
 * With `scale: 'auto'` the main stream is made as big as possible while every
 * other tile stays big enough for Twitch to autoplay it.
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
  const mainWidth =
    scale === 'auto'
      ? autoMainWidth(others, container, opts, maxMainWidth)
      : manualMainWidth(others, container, opts, maxMainWidth, scale);
  return arrange(mainWidth, others, container, opts).rects;
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
