export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point, Size {}

export type LayoutMode = 'grid' | 'focus';

export interface LayoutOptions {
  /** Space between tiles, in px. */
  gap: number;
  /** Video aspect ratio (width / height). Twitch streams are 16:9. */
  aspect: number;
  /**
   * Smallest player size Twitch allows to autoplay. Layouts try hard to keep
   * every tile at least this big.
   */
  minTile: Size;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  gap: 4,
  aspect: 16 / 9,
  minTile: { width: 400, height: 300 },
};
