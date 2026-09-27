import { computeFocusLayout, type MainScale } from './focus';
import { roundRects } from './geometry';
import { computeGridLayout } from './grid';
import type { LayoutMode, LayoutOptions, Rect, Size } from './types';

export interface LayoutRequest {
  mode: LayoutMode;
  count: number;
  container: Size;
  options: LayoutOptions;
  /** Focus mode only. */
  mainScale?: MainScale;
}

/**
 * Single entry point used by the UI. Returns one pixel-snapped rect per slot;
 * in focus mode slot 0 is the main stream.
 */
export function computeLayout(req: LayoutRequest): Rect[] {
  const rects =
    req.mode === 'focus'
      ? computeFocusLayout(req.count, req.container, req.options, req.mainScale ?? 'auto')
      : computeGridLayout(req.count, req.container, req.options);
  return roundRects(rects);
}
