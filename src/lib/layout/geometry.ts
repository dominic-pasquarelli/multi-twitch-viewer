import type { Point, Rect, Size } from './types';

export const area = (r: Size): number => r.width * r.height;

/** True when a tile is smaller than the minimum Twitch needs to autoplay. */
export const isBelowMinimum = (r: Size, min: Size): boolean =>
  r.width + 0.5 < min.width || r.height + 0.5 < min.height;

/**
 * Size of the smallest 16:9 (or whatever `aspect`) tile that still satisfies
 * the minimum player size.
 */
export const minTileForAspect = (min: Size, aspect: number): Size => {
  const width = Math.max(min.width, min.height * aspect);
  return { width, height: width / aspect };
};

/** Translates rects so their bounding box is centred inside the container. */
export function centerRects(rects: Rect[], container: Size): Rect[] {
  if (rects.length === 0) return rects;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const dx = (container.width - (maxX - minX)) / 2 - minX;
  const dy = (container.height - (maxY - minY)) / 2 - minY;
  return rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
}

/** Snaps rects to whole pixels without letting neighbours overlap. */
export const roundRects = (rects: Rect[]): Rect[] =>
  rects.map((r) => {
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    return {
      x,
      y,
      width: Math.max(0, Math.floor(r.x + r.width) - x),
      height: Math.max(0, Math.floor(r.y + r.height) - y),
    };
  });

/** Index of the rect containing the point, or -1. */
export function rectIndexAt(rects: Rect[], p: Point): number {
  return rects.findIndex(
    (r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height,
  );
}
